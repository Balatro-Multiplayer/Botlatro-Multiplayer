import { pool } from '../../db'
import { setUserQueueRole, updateAllLeaderboardRoles } from '../../utils/queueHelpers'
import { getActiveSeason } from '../../utils/queryDB'

type PlayerSeasonQueueRow = {
  queue_id: number
  queue_name: string
  default_elo: number
}

type QueueSeasonMatchRow = {
  match_id: number
  winning_team: number
  user_id: string
  team: number
  elo_change: number
}

type QueueUserState = {
  elo: number
  peakElo: number
  winStreak: number
  peakWinStreak: number
  volatility: number
}

export type RebuiltSeasonQueueResult = {
  queueId: number
  queueName: string
  usersUpdated: number
  matchesProcessed: number
  matchUserRowsUpdated: number
}

export type RebuildPlayerSeasonQueuesResult = {
  playerId: string
  season: number
  queues: RebuiltSeasonQueueResult[]
}

function clampMmr(value: number): number {
  return Math.max(0, Math.min(9999, parseFloat(value.toFixed(1))))
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }

  return chunks
}

async function getPlayerSeasonQueues(
  playerId: string,
  season: number,
): Promise<PlayerSeasonQueueRow[]> {
  const result = await pool.query<PlayerSeasonQueueRow>(
    `
      SELECT DISTINCT
        q.id AS queue_id,
        q.queue_name,
        q.default_elo
      FROM matches m
      JOIN match_users mu ON mu.match_id = m.id
      JOIN queues q ON q.id = m.queue_id
      WHERE mu.user_id = $1
        AND m.season = $2
      ORDER BY q.id
    `,
    [playerId, season],
  )

  return result.rows
}

async function rebuildQueueSeasonRatings(
  queueId: number,
  queueName: string,
  defaultElo: number,
  season: number,
): Promise<RebuiltSeasonQueueResult> {
  const db = await pool.connect()

  try {
    await db.query('BEGIN')

    const queueUsersRes = await db.query<{ user_id: string }>(
      `SELECT user_id FROM queue_users WHERE queue_id = $1`,
      [queueId],
    )

    const userStates = new Map<string, QueueUserState>(
      queueUsersRes.rows.map((row) => [
        row.user_id,
        {
          elo: defaultElo,
          peakElo: defaultElo,
          winStreak: 0,
          peakWinStreak: 0,
          volatility: 0,
        },
      ]),
    )

    await db.query(
      `
        UPDATE queue_users
        SET elo = $1,
            peak_elo = $1,
            win_streak = 0,
            peak_win_streak = 0,
            volatility = 0
        WHERE queue_id = $2
      `,
      [defaultElo, queueId],
    )

    await db.query(
      `
        UPDATE match_users mu
        SET mmr_after = NULL
        FROM matches m
        WHERE mu.match_id = m.id
          AND m.queue_id = $1
          AND m.season = $2
      `,
      [queueId, season],
    )

    const matchRowsRes = await db.query<QueueSeasonMatchRow>(
      `
        SELECT
          m.id AS match_id,
          m.winning_team,
          mu.user_id,
          mu.team,
          COALESCE(mu.elo_change, 0)::float8 AS elo_change
        FROM matches m
        JOIN match_users mu ON mu.match_id = m.id
        WHERE m.queue_id = $1
          AND m.season = $2
          AND m.winning_team IS NOT NULL
        ORDER BY m.created_at ASC, m.id ASC, mu.user_id ASC
      `,
      [queueId, season],
    )

    const mmrAfterUpdates: Array<{
      matchId: number
      userId: string
      mmrAfter: number
    }> = []
    const processedMatchIds = new Set<number>()

    for (const row of matchRowsRes.rows) {
      processedMatchIds.add(row.match_id)

      const current =
        userStates.get(row.user_id) ??
        ({
          elo: defaultElo,
          peakElo: defaultElo,
          winStreak: 0,
          peakWinStreak: 0,
          volatility: 0,
        } satisfies QueueUserState)

      const newElo = clampMmr(current.elo + Number(row.elo_change))
      const won = row.winning_team === row.team

      const newWinStreak = won
        ? current.winStreak < 0
          ? 1
          : current.winStreak + 1
        : current.winStreak > 0
          ? -1
          : current.winStreak - 1

      const nextState: QueueUserState = {
        elo: newElo,
        peakElo: Math.max(current.peakElo, newElo),
        winStreak: newWinStreak,
        peakWinStreak: won
          ? Math.max(current.peakWinStreak, newWinStreak)
          : current.peakWinStreak,
        volatility: Math.min(current.volatility + 1, 10),
      }

      userStates.set(row.user_id, nextState)
      mmrAfterUpdates.push({
        matchId: row.match_id,
        userId: row.user_id,
        mmrAfter: newElo,
      })
    }

    for (const userBatch of chunk([...userStates.entries()], 500)) {
      const values: any[] = []
      const placeholders = userBatch.map(([userId, state], index) => {
        const offset = index * 6
        values.push(
          userId,
          state.elo,
          state.peakElo,
          state.winStreak,
          state.peakWinStreak,
          state.volatility,
        )
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
      })

      await db.query(
        `
          UPDATE queue_users qu
          SET elo = v.elo,
              peak_elo = v.peak_elo,
              win_streak = v.win_streak,
              peak_win_streak = v.peak_win_streak,
              volatility = v.volatility
          FROM (
            VALUES ${placeholders.join(', ')}
          ) AS v(user_id, elo, peak_elo, win_streak, peak_win_streak, volatility)
          WHERE qu.user_id = v.user_id
            AND qu.queue_id = $${values.length + 1}
        `,
        [...values, queueId],
      )
    }

    for (const mmrBatch of chunk(mmrAfterUpdates, 500)) {
      const values: any[] = []
      const placeholders = mmrBatch.map((row, index) => {
        const offset = index * 3
        values.push(row.matchId, row.userId, row.mmrAfter)
        return `($${offset + 1}, $${offset + 2}, $${offset + 3})`
      })

      await db.query(
        `
          UPDATE match_users mu
          SET mmr_after = v.mmr_after
          FROM (
            VALUES ${placeholders.join(', ')}
          ) AS v(match_id, user_id, mmr_after)
          WHERE mu.match_id = v.match_id
            AND mu.user_id = v.user_id
        `,
        values,
      )
    }

    await db.query('COMMIT')

    const userIds = [...userStates.keys()]
    for (const userBatch of chunk(userIds, 25)) {
      await Promise.all(
        userBatch.map((userId) => setUserQueueRole(queueId, userId)),
      )
    }
    await updateAllLeaderboardRoles(queueId)

    return {
      queueId,
      queueName,
      usersUpdated: userStates.size,
      matchesProcessed: processedMatchIds.size,
      matchUserRowsUpdated: mmrAfterUpdates.length,
    }
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    db.release()
  }
}

export async function rebuildPlayerSeasonQueues(
  playerId: string,
): Promise<RebuildPlayerSeasonQueuesResult> {
  const season = await getActiveSeason()
  const queues = await getPlayerSeasonQueues(playerId, season)

  const results: RebuiltSeasonQueueResult[] = []
  for (const queue of queues) {
    results.push(
      await rebuildQueueSeasonRatings(
        queue.queue_id,
        queue.queue_name,
        queue.default_elo,
        season,
      ),
    )
  }

  return {
    playerId,
    season,
    queues: results,
  }
}

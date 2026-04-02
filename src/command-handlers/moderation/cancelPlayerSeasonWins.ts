import { pool } from '../../db'
import { logModerationEvent } from '../../utils/logModerationEvent'
import { formatCancelledMatchResult } from '../../utils/matchHelpers'
import { getActiveSeason } from '../../utils/queryDB'
import { cancelMatch, finalizeCancelledMatch } from './cancelMatch'

type WonMatchRow = {
  match_id: number
  queue_id: number
  queue_name: string | null
  created_at: Date
}

export type CancelPlayerSeasonWinsMatchResult = {
  matchId: number
  queueId: number
  queueName: string | null
  createdAt: string
  success: boolean
  cancelled: boolean
  revertedMmrChanges: {
    userId: string
    revertedChange: number
  }[]
  message: string
  error: string | null
}

export type CancelPlayerSeasonWinsResult = {
  playerId: string
  season: number
  matchesFound: number
  matchesCancelled: number
  failures: number
  results: CancelPlayerSeasonWinsMatchResult[]
}

async function getWonMatchesForSeason(
  playerId: string,
  season: number,
): Promise<WonMatchRow[]> {
  const result = await pool.query<WonMatchRow>(
    `
      SELECT DISTINCT
        m.id AS match_id,
        m.queue_id,
        q.queue_name,
        m.created_at
      FROM matches m
      JOIN match_users mu ON mu.match_id = m.id
      LEFT JOIN queues q ON q.id = m.queue_id
      WHERE mu.user_id = $1
        AND m.season = $2
        AND m.winning_team IS NOT NULL
        AND m.winning_team = mu.team
      ORDER BY m.created_at DESC, m.id DESC
    `,
    [playerId, season],
  )

  return result.rows
}

export async function cancelPlayerSeasonWins(
  playerId: string,
  moderatorId?: string,
  options?: {
    finalizeOnly?: boolean
  },
): Promise<CancelPlayerSeasonWinsResult> {
  const season = await getActiveSeason()
  const matches = await getWonMatchesForSeason(playerId, season)

  const results: CancelPlayerSeasonWinsMatchResult[] = []
  let matchesCancelled = 0
  let failures = 0

  for (const match of matches) {
    try {
      const cancelResult = options?.finalizeOnly
        ? await finalizeCancelledMatch(match.match_id)
        : await cancelMatch(match.match_id)

      if (cancelResult.success) {
        matchesCancelled++
      } else {
        failures++
      }

      results.push({
        matchId: match.match_id,
        queueId: match.queue_id,
        queueName: match.queue_name,
        createdAt: match.created_at.toISOString(),
        success: cancelResult.success,
        cancelled: cancelResult.cancelled,
        revertedMmrChanges: cancelResult.revertedMmrChanges,
        message: options?.finalizeOnly
          ? `Successfully finalized cancelled match ${match.match_id} without additional MMR revert.`
          : formatCancelledMatchResult(match.match_id, cancelResult),
        error: null,
      })
    } catch (error) {
      failures++

      results.push({
        matchId: match.match_id,
        queueId: match.queue_id,
        queueName: match.queue_name,
        createdAt: match.created_at.toISOString(),
        success: false,
        cancelled: false,
        revertedMmrChanges: [],
        message: `Failed to cancel match ${match.match_id}.`,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  if (moderatorId && matchesCancelled > 0) {
    await logModerationEvent({
      action: 'season_wins_cancel',
      moderatorId,
      targetId: playerId,
      details: {
        season,
        matchesFound: matches.length,
        matchesCancelled,
        failures,
        matchIds: results.filter((r) => r.success).map((r) => r.matchId),
      },
    })
  }

  return {
    playerId,
    season,
    matchesFound: matches.length,
    matchesCancelled,
    failures,
    results,
  }
}

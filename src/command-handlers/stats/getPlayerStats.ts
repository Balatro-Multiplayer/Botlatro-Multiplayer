import { pool } from '../../db'
import { getActiveSeason, getLeaderboardPosition } from '../../utils/queryDB'

export type PlayerStatsData = {
  mmr: number
  wins: number
  losses: number
  streak: number
  totalgames: number
  decay: number
  name: string | null
  peak_mmr: number
  peak_streak: number
  rank: number
  winrate: number
}

/**
 * Gets player statistics for a specific queue.
 *
 * @param {string} userId - The Discord user ID of the player.
 * @param {number} queueId - The queue ID to fetch stats for.
 * @param {number} season - Optional season number to filter matches by.
 * @return {Promise<PlayerStatsData | null>} A promise that resolves to the player stats or null if not found.
 */
export async function getPlayerStats(
  userId: string,
  queueId: number,
  season?: number,
): Promise<PlayerStatsData | null> {
  try {
    const activeSeason = await getActiveSeason()
    const isHistorical = season !== undefined && season !== activeSeason

    let player: {
      elo: number
      peak_elo: number
      win_streak: number
      peak_win_streak: number
      is_decay: boolean
      display_name: string | null
    }

    if (isHistorical) {
      // Historical season: read MMR/peak/streak from queue_users_seasons snapshot
      const snapshotRes = await pool.query(
        `
        SELECT
          qus.elo,
          qus.peak_elo,
          qus.win_streak,
          qus.peak_win_streak,
          false as is_decay,
          u.display_name
        FROM queue_users_seasons qus
        LEFT JOIN users u ON u.user_id = qus.user_id
        WHERE qus.user_id = $1 AND qus.queue_id = $2 AND qus.season = $3
        `,
        [userId, queueId, season],
      )

      if (snapshotRes.rowCount === 0) {
        return null
      }

      player = snapshotRes.rows[0]
    } else {
      // Current season: read from queue_users
      const playerRes = await pool.query(
        `
        SELECT
          qu.elo,
          qu.peak_elo,
          qu.win_streak,
          qu.peak_win_streak,
          qu.is_decay,
          u.display_name
        FROM queue_users qu
        LEFT JOIN users u ON u.user_id = qu.user_id
        WHERE qu.user_id = $1 AND qu.queue_id = $2
        `,
        [userId, queueId],
      )

      if (playerRes.rowCount === 0) {
        return null
      }

      player = playerRes.rows[0]
    }

    // Calculate wins, losses, and total games from match_users
    const statsParams: any[] = [userId, queueId]
    let seasonFilter = ''
    if (season !== undefined) {
      statsParams.push(season)
      seasonFilter = ` AND m.season = $${statsParams.length}`
    }

    const statsRes = await pool.query(
      `
      SELECT
        COUNT(CASE WHEN m.winning_team = mu.team THEN 1 END)::integer as wins,
        COUNT(CASE WHEN m.winning_team IS NOT NULL AND m.winning_team != mu.team THEN 1 END)::integer as losses,
        COUNT(CASE WHEN m.winning_team IS NOT NULL THEN 1 END)::integer as games_played
      FROM match_users mu
      JOIN matches m ON m.id = mu.match_id
      WHERE mu.user_id = $1 AND m.queue_id = $2${seasonFilter}
      `,
      statsParams,
    )

    const wins = statsRes.rows[0]?.wins || 0
    const losses = statsRes.rows[0]?.losses || 0
    const totalgames = statsRes.rows[0]?.games_played || 0

    // Calculate winrate
    const winrate = totalgames > 0 ? (wins / totalgames) * 100 : 0

    // Get leaderboard position
    const rank = (await getLeaderboardPosition(queueId, userId, season)) || 0

    return {
      mmr: player.elo,
      wins,
      losses,
      streak: player.win_streak,
      totalgames,
      decay: player.is_decay ? 1 : 0,
      name: player.display_name || null,
      peak_mmr: player.peak_elo,
      peak_streak: player.peak_win_streak,
      rank,
      winrate: Math.round(winrate * 100) / 100,
    }
  } catch (error) {
    console.error('Error fetching player stats:', error)
    throw error
  }
}

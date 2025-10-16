import { pool } from '../../db'
import { getLeaderboardPosition } from '../../utils/queryDB'

export type PlayerStatsData = {
  mmr: number
  wins: number
  losses: number
  streak: number
  totalgames: number
  decay: number
  ign: null
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
 * @return {Promise<PlayerStatsData | null>} A promise that resolves to the player stats or null if not found.
 */
export async function getPlayerStats(
  userId: string,
  queueId: number,
): Promise<PlayerStatsData | null> {
  try {
    // Get player stats from queue_users
    const playerRes = await pool.query(
      `
      SELECT
        qu.elo,
        qu.peak_elo,
        qu.win_streak,
        qu.peak_win_streak,
        qu.is_decay
      FROM queue_users qu
      WHERE qu.user_id = $1 AND qu.queue_id = $2
      `,
      [userId, queueId],
    )

    if (playerRes.rowCount === 0) {
      return null
    }

    const player = playerRes.rows[0]

    // Calculate wins, losses, and total games from match_users
    const statsRes = await pool.query(
      `
      SELECT
        COUNT(CASE WHEN m.winning_team = mu.team THEN 1 END)::integer as wins,
        COUNT(CASE WHEN m.winning_team IS NOT NULL AND m.winning_team != mu.team THEN 1 END)::integer as losses,
        COUNT(CASE WHEN m.winning_team IS NOT NULL THEN 1 END)::integer as games_played
      FROM match_users mu
      JOIN matches m ON m.id = mu.match_id
      WHERE mu.user_id = $1 AND m.queue_id = $2
      `,
      [userId, queueId],
    )

    const wins = statsRes.rows[0]?.wins || 0
    const losses = statsRes.rows[0]?.losses || 0
    const totalgames = statsRes.rows[0]?.games_played || 0

    // Calculate winrate
    const winrate = totalgames > 0 ? (wins / totalgames) * 100 : 0

    // Get leaderboard position
    const rank = (await getLeaderboardPosition(queueId, userId)) || 0

    return {
      mmr: player.elo,
      wins,
      losses,
      streak: player.win_streak,
      totalgames,
      decay: player.is_decay ? 1 : 0,
      ign: null,
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

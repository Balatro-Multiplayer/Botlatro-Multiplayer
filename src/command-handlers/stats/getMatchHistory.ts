import { pool } from '../../db'

export type MatchHistoryEntry = {
  match_id: number
  won: boolean
  elo_change: number | null
  team: number | null
  deck: string | null
  stake: string | null
  best_of_3: boolean
  best_of_5: boolean
  created_at: string
  winning_team: number | null
}

/**
 * Gets match history for a player in a specific queue.
 *
 * @param {string} userId - The Discord user ID of the player.
 * @param {number} queueId - The queue ID to fetch match history for.
 * @param {number} limit - Optional maximum number of matches to return. If not provided, returns all matches.
 * @return {Promise<MatchHistoryEntry[]>} A promise that resolves to an array of match history entries.
 */
export async function getMatchHistory(
  userId: string,
  queueId: number,
  limit?: number,
): Promise<MatchHistoryEntry[]> {
  try {
    // Get match history for the player
    let query = `
      SELECT
        m.id as match_id,
        m.winning_team,
        m.deck,
        m.stake,
        m.best_of_3,
        m.best_of_5,
        m.created_at,
        mu.team,
        mu.elo_change
      FROM match_users mu
      JOIN matches m ON m.id = mu.match_id
      WHERE mu.user_id = $1 AND m.queue_id = $2 AND m.winning_team IS NOT NULL
      ORDER BY m.created_at DESC
    `

    const params: any[] = [userId, queueId]
    if (limit) {
      query += ` LIMIT $${params.length + 1}`
      params.push(limit)
    }

    const historyRes = await pool.query(query, params)

    return historyRes.rows.map((row) => ({
      match_id: row.match_id,
      won: row.winning_team === row.team,
      elo_change: row.elo_change,
      team: row.team,
      deck: row.deck,
      stake: row.stake,
      best_of_3: row.best_of_3,
      best_of_5: row.best_of_5,
      created_at: row.created_at.toISOString(),
      winning_team: row.winning_team,
    }))
  } catch (error) {
    console.error('Error fetching match history:', error)
    throw error
  }
}

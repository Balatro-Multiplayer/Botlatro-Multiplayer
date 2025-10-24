import { pool } from '../../db'

export type OverallHistoryEntry = {
  match_id: number
  winning_team: number | null
  deck: string | null
  stake: string | null
  best_of_3: boolean
  best_of_5: boolean
  created_at: string
  players: {
    user_id: string
    team: number | null
    elo_change: number | null
  }[]
}

/**
 * Gets overall match history for a queue.
 *
 * @param {number} queueId - The queue ID to fetch match history for.
 * @param {number} limit - Optional maximum number of matches to return. If not provided, returns all matches.
 * @return {Promise<OverallHistoryEntry[]>} A promise that resolves to an array of match history entries.
 */
export async function getOverallHistory(
  queueId: number,
  limit?: number,
): Promise<OverallHistoryEntry[]> {
  try {
    // Get overall match history with players in a single query using JSON aggregation
    let query = `
      SELECT
        m.id as match_id,
        m.winning_team,
        m.deck,
        m.stake,
        m.best_of_3,
        m.best_of_5,
        m.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'user_id', mu.user_id,
              'team', mu.team,
              'elo_change', mu.elo_change
            )
            ORDER BY mu.team, mu.user_id
          ) FILTER (WHERE mu.user_id IS NOT NULL),
          '[]'::json
        ) as players
      FROM matches m
      LEFT JOIN match_users mu ON m.id = mu.match_id
      WHERE m.queue_id = $1 AND m.winning_team IS NOT NULL
      GROUP BY m.id, m.winning_team, m.deck, m.stake, m.best_of_3, m.best_of_5, m.created_at
      ORDER BY m.created_at DESC
    `

    const params: any[] = [queueId]
    if (limit) {
      query += ` LIMIT $${params.length + 1}`
      params.push(limit)
    }

    const historyRes = await pool.query(query, params)

    return historyRes.rows.map((row) => ({
      match_id: row.match_id,
      winning_team: row.winning_team,
      deck: row.deck,
      stake: row.stake,
      best_of_3: row.best_of_3,
      best_of_5: row.best_of_5,
      created_at: row.created_at.toISOString(),
      players: row.players,
    }))
  } catch (error) {
    console.error('Error fetching overall match history:', error)
    throw error
  }
}

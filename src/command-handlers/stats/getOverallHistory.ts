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
    name: string
    team: number | null
    elo_change: number | null
    mmr_after: number
  }[]
}

/**
 * Gets overall match history for a queue.
 *
 * @param {number} queueId - The queue ID to fetch match history for.
 * @param {number} limit - Optional maximum number of matches to return. If not provided, returns all matches.
 * @param {string} startDate - Optional start date to filter matches (ISO 8601 format).
 * @param {string} endDate - Optional end date to filter matches (ISO 8601 format).
 * @return {Promise<OverallHistoryEntry[]>} A promise that resolves to an array of match history entries.
 */
export async function getOverallHistory(
  queueId: number,
  limit?: number,
  startDate?: string,
  endDate?: string,
): Promise<OverallHistoryEntry[]> {
  try {
    // Get flat list of all match-player combinations with calculated MMR
    let query = `
      WITH user_current_elo AS (
        SELECT user_id, elo
        FROM queue_users
        WHERE queue_id = $1
      ),
      match_elo_changes AS (
        SELECT
          mu.match_id,
          mu.user_id,
          mu.elo_change,
          m.created_at,
          SUM(mu.elo_change) OVER (
            PARTITION BY mu.user_id
            ORDER BY m.created_at DESC, m.id DESC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) as cumulative_change_from_now
        FROM match_users mu
        JOIN matches m ON mu.match_id = m.id
        WHERE m.queue_id = $1 AND m.winning_team IS NOT NULL
      ),
      match_elo_at_time AS (
        SELECT
          mec.match_id,
          mec.user_id,
          uce.elo - mec.cumulative_change_from_now + mec.elo_change as elo_after_match
        FROM match_elo_changes mec
        JOIN user_current_elo uce ON mec.user_id = uce.user_id
      )
      SELECT
        m.id as match_id,
        m.winning_team,
        m.deck,
        m.stake,
        m.best_of_3,
        m.best_of_5,
        m.created_at,
        mu.user_id,
        u.display_name as player_name,
        mu.team,
        mu.elo_change,
        meat.elo_after_match as mmr_after
      FROM matches m
      LEFT JOIN match_users mu ON m.id = mu.match_id
      LEFT JOIN users u ON mu.user_id = u.user_id
      LEFT JOIN match_elo_at_time meat ON mu.match_id = meat.match_id AND mu.user_id = meat.user_id
      WHERE m.queue_id = $1 AND m.winning_team IS NOT NULL
    `

    const params: any[] = [queueId]

    // Add date range filters if provided
    if (startDate) {
      query += ` AND m.created_at >= $${params.length + 1}`
      params.push(startDate)
    }
    if (endDate) {
      query += ` AND m.created_at <= $${params.length + 1}`
      params.push(endDate)
    }

    query += ` ORDER BY m.created_at DESC, mu.team, mu.user_id`

    if (limit) {
      query += ` LIMIT $${params.length + 1}`
      params.push(limit)
    }

    const result = await pool.query(query, params)

    // Group rows by match in application layer
    const matchesMap = new Map<number, OverallHistoryEntry>()

    for (const row of result.rows) {
      if (!matchesMap.has(row.match_id)) {
        matchesMap.set(row.match_id, {
          match_id: row.match_id,
          winning_team: row.winning_team,
          deck: row.deck,
          stake: row.stake,
          best_of_3: row.best_of_3,
          best_of_5: row.best_of_5,
          created_at: row.created_at.toISOString(),
          players: [],
        })
      }

      const match = matchesMap.get(row.match_id)!
      if (row.user_id) {
        match.players.push({
          user_id: row.user_id,
          name: row.player_name,
          team: row.team,
          elo_change: row.elo_change,
          mmr_after: row.mmr_after,
        })
      }
    }

    return Array.from(matchesMap.values())
  } catch (error) {
    console.error('Error fetching overall match history:', error)
    throw error
  }
}

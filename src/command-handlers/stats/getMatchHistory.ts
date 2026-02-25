import { pool } from '../../db'

export type MatchHistoryEntry = {
  match_id: number
  player_name: string
  player_id: string
  mmr_after: number
  won: boolean
  elo_change: number | null
  team: number | null
  opponents: {
    user_id: string
    name: string
    team: number | null
    elo_change: number | null
    mmr_after: number
  }[]
  deck: string | null
  stake: string | null
  best_of_3: boolean
  best_of_5: boolean
  created_at: string
  winning_team: number | null
  queue_id: number
  season: number
}

/**
 * Gets match history for a player.
 * @returns {Promise<MatchHistoryEntry[]>} A promise that resolves to an array of match history entries.
 */
export async function getMatchHistory({
  userId,
  queueId,
  limit,
  offset,
  startDate,
  endDate,
  season,
}: {
  userId: string
  queueId?: number
  limit?: number
  offset?: number
  startDate?: string
  endDate?: string
  season?: number
}): Promise<MatchHistoryEntry[]> {
  try {
    // Get match history for the player with opponent details
    // Uses cached mmr_after from match_users for performance
    const params: any[] = [userId]
    let paramIndex = 2

    let query = `
      SELECT
        m.id as match_id,
        m.winning_team,
        m.deck,
        m.stake,
        m.best_of_3,
        m.best_of_5,
        m.created_at,
        m.queue_id,
        m.season,
        mu.team as player_team,
        mu.elo_change as player_elo_change,
        mu.mmr_after as player_mmr_after,
        u.display_name as player_name,
        all_mu.user_id as all_user_id,
        all_u.display_name as all_player_name,
        all_mu.team as all_team,
        all_mu.elo_change as all_elo_change,
        all_mu.mmr_after as all_mmr_after
      FROM match_users mu
      JOIN matches m ON m.id = mu.match_id
      LEFT JOIN users u ON mu.user_id = u.user_id
      LEFT JOIN match_users all_mu ON m.id = all_mu.match_id AND all_mu.user_id != $1
      LEFT JOIN users all_u ON all_mu.user_id = all_u.user_id
      WHERE mu.user_id = $1
        AND m.winning_team IS NOT NULL
        AND mu.mmr_after IS NOT NULL
        ${queueId !== undefined ? `AND m.queue_id = $${paramIndex}` : ''}
    `

    if (queueId !== undefined) {
      params.push(queueId)
      paramIndex++
    }

    if (season !== undefined) {
      query += ` AND m.season = $${paramIndex}`
      params.push(season)
      paramIndex++
    }

    // Add date range filters if provided
    if (startDate) {
      query += ` AND m.created_at >= $${params.length + 1}`
      params.push(startDate)
    }
    if (endDate) {
      query += ` AND m.created_at <= $${params.length + 1}`
      params.push(endDate)
    }

    query += ` ORDER BY m.created_at DESC`

    if (limit) {
      query += ` LIMIT $${params.length + 1}`
      params.push(limit)
    }

    if (offset) {
      query += ` OFFSET $${params.length + 1}`
      params.push(offset)
    }

    const result = await pool.query(query, params)

    // Group rows by match in application layer
    const matchesMap = new Map<number, MatchHistoryEntry>()

    for (const row of result.rows) {
      if (!matchesMap.has(row.match_id)) {
        matchesMap.set(row.match_id, {
          match_id: row.match_id,
          player_name: row.player_name || 'Unknown',
          player_id: userId,
          mmr_after: row.player_mmr_after,
          won: row.winning_team === row.player_team,
          elo_change: row.player_elo_change,
          team: row.player_team,
          opponents: [],
          deck: row.deck,
          stake: row.stake,
          best_of_3: row.best_of_3,
          best_of_5: row.best_of_5,
          created_at: row.created_at.toISOString(),
          winning_team: row.winning_team,
          queue_id: row.queue_id,
          season: row.season,
        })
      }

      const match = matchesMap.get(row.match_id)!
      // Add opponent if it's not the player themselves
      if (row.all_user_id && row.all_user_id !== userId) {
        match.opponents.push({
          user_id: row.all_user_id,
          name: row.all_player_name,
          team: row.all_team,
          elo_change: row.all_elo_change,
          mmr_after: row.all_mmr_after,
        })
      }
    }

    return Array.from(matchesMap.values())
  } catch (error) {
    console.error('Error fetching match history:', error)
    throw error
  }
}

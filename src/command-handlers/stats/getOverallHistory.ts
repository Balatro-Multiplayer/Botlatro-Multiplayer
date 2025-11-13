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
 * @param {string} afterMatchId - Optional match ID to fetch games after (newer than) this match.
 * @param {string} beforeMatchId - Optional match ID to fetch games before (older than) this match.
 * @param {string} matchId - Optional match ID to fetch a specific match only.
 * @return {Promise<OverallHistoryEntry[]>} A promise that resolves to an array of match history entries.
 */
export async function getOverallHistory(
  queueId: number,
  limit?: number,
  startDate?: string,
  endDate?: string,
  afterMatchId?: string,
  beforeMatchId?: string,
  matchId?: string,
): Promise<OverallHistoryEntry[]> {
  try {
    // Optimized query strategy:
    // 1. First CTE filters and limits matches BEFORE any ELO calculations
    // 2. Get only relevant match_users for those filtered matches
    // 3. Calculate cumulative ELO changes only for users in filtered matches
    // 4. This reduces window function processing from ALL matches to just what we need

    let matchFilterConditions =
      'WHERE m.queue_id = $1 AND m.winning_team IS NOT NULL'
    const params: any[] = [queueId]

    // Add specific match ID filter
    if (matchId) {
      const parsedMatchId = parseInt(matchId, 10)
      if (!isNaN(parsedMatchId)) {
        matchFilterConditions += ` AND m.id = $${params.length + 1}`
        params.push(parsedMatchId)
      }
    }

    // Add match ID filters
    if (afterMatchId) {
      const parsedAfterMatchId = parseInt(afterMatchId, 10)
      if (!isNaN(parsedAfterMatchId)) {
        matchFilterConditions += ` AND m.id > $${params.length + 1}`
        params.push(parsedAfterMatchId)
      }
    }
    if (beforeMatchId) {
      const parsedBeforeMatchId = parseInt(beforeMatchId, 10)
      if (!isNaN(parsedBeforeMatchId)) {
        matchFilterConditions += ` AND m.id < $${params.length + 1}`
        params.push(parsedBeforeMatchId)
      }
    }

    // Add date range filters if provided
    if (startDate) {
      matchFilterConditions += ` AND m.created_at >= $${params.length + 1}`
      params.push(startDate)
    }
    if (endDate) {
      matchFilterConditions += ` AND m.created_at <= $${params.length + 1}`
      params.push(endDate)
    }

    // Build limit clause for matches (not rows)
    const limitClause = limit ? `LIMIT ${limit}` : ''

    const query = `
      WITH filtered_matches AS (
        SELECT
          m.id,
          m.winning_team,
          m.deck,
          m.stake,
          m.best_of_3,
          m.best_of_5,
          m.created_at
        FROM matches m
        ${matchFilterConditions}
        ORDER BY m.created_at DESC
        ${limitClause}
      ),
      user_current_elo AS (
        SELECT user_id, elo
        FROM queue_users
        WHERE queue_id = $1
      ),
      relevant_users AS (
        SELECT DISTINCT mu.user_id
        FROM match_users mu
        JOIN filtered_matches fm ON mu.match_id = fm.id
      ),
      all_user_matches AS (
        SELECT
          mu.match_id,
          mu.user_id,
          mu.elo_change,
          m.created_at,
          m.id as match_pk
        FROM match_users mu
        JOIN matches m ON mu.match_id = m.id
        JOIN relevant_users ru ON mu.user_id = ru.user_id
        WHERE m.queue_id = $1 AND m.winning_team IS NOT NULL
      ),
      match_elo_changes AS (
        SELECT
          aum.match_id,
          aum.user_id,
          aum.elo_change,
          SUM(aum.elo_change) OVER (
            PARTITION BY aum.user_id
            ORDER BY aum.created_at DESC, aum.match_pk DESC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) as cumulative_change_from_now
        FROM all_user_matches aum
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
        fm.id as match_id,
        fm.winning_team,
        fm.deck,
        fm.stake,
        fm.best_of_3,
        fm.best_of_5,
        fm.created_at,
        mu.user_id,
        u.display_name as player_name,
        mu.team,
        mu.elo_change,
        meat.elo_after_match as mmr_after
      FROM filtered_matches fm
      LEFT JOIN match_users mu ON fm.id = mu.match_id
      LEFT JOIN users u ON mu.user_id = u.user_id
      LEFT JOIN match_elo_at_time meat ON mu.match_id = meat.match_id AND mu.user_id = meat.user_id
      ORDER BY fm.created_at DESC, mu.team, mu.user_id
    `

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

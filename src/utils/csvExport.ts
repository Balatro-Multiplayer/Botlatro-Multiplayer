import { pool } from '../db'
import type { Matches, QueueUsers } from 'psqlDB'

interface MatchData
  extends Omit<
    Matches,
    | 'id'
    | 'open'
    | 'match_vc_id'
    | 'stake_vote_team_id'
    | 'deck_vote_ended'
    | 'stake_vote_ended'
  > {
  match_id: number
  queue_name: string
}

interface MatchUserData {
  match_id: number
  user_id: string
  display_name: string | null
  team: number
  elo_change: number | null
}

interface QueueUserData
  extends Omit<
    QueueUsers,
    'id' | 'current_elo_range' | 'is_decay' | 'next_decay_at' | 'decaying_since'
  > {
  display_name: string | null
  queue_name: string
  wins: number
  losses: number
  games_played: number
}

/**
 * Escapes a CSV field value by wrapping it in quotes if necessary
 */
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = String(value)

  // If the field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

/**
 * Converts an array of objects to CSV format
 */
function arrayToCsv<T extends Record<string, any>>(
  data: T[],
  headers: (keyof T)[],
): string {
  const headerRow = headers.map((h) => escapeCsvField(h)).join(',')
  const dataRows = data.map((row) =>
    headers.map((header) => escapeCsvField(row[header])).join(','),
  )

  return [headerRow, ...dataRows].join('\n')
}

/**
 * Exports all season data to CSV format
 * Returns an object with CSV strings for matches, match_users, and queue_users
 */
export async function exportSeasonData(): Promise<{
  matches: string
  matchUsers: string
  queueUsers: string
  summary: string
}> {
  try {
    console.log('[CSV Export] Starting season data export...')
    const startTime = Date.now()

    // Fetch matches with queue names
    console.log('[CSV Export] Fetching matches data...')
    const matchesStart = Date.now()
    const matchesResult = await pool.query<MatchData>(`
      SELECT
        m.id as match_id,
        m.queue_id,
        q.queue_name,
        m.channel_id,
        m.created_at,
        m.winning_team,
        m.best_of_3,
        m.best_of_5,
        m.deck,
        m.stake
      FROM matches m
      LEFT JOIN queues q ON m.queue_id = q.id
      ORDER BY m.created_at DESC
    `)
    console.log(`[CSV Export] Fetched ${matchesResult.rows.length} matches in ${Date.now() - matchesStart}ms`)

    // Fetch match users with display names
    console.log('[CSV Export] Fetching match users data...')
    const matchUsersStart = Date.now()
    const matchUsersResult = await pool.query<MatchUserData>(`
      SELECT
        mu.match_id,
        mu.user_id,
        u.display_name,
        mu.team,
        mu.elo_change
      FROM match_users mu
      LEFT JOIN users u ON mu.user_id = u.user_id
      ORDER BY mu.match_id, mu.team, mu.user_id
    `)
    console.log(`[CSV Export] Fetched ${matchUsersResult.rows.length} match users in ${Date.now() - matchUsersStart}ms`)

    // Fetch queue users with display names and queue names (stats calculated separately for performance)
    console.log('[CSV Export] Fetching queue users data...')
    const queueUsersStart = Date.now()
    const queueUsersResult = await pool.query<Omit<QueueUserData, 'wins' | 'losses' | 'games_played'>>(`
      SELECT
        qu.user_id,
        u.display_name,
        qu.queue_id,
        q.queue_name,
        qu.elo,
        qu.peak_elo,
        qu.win_streak,
        qu.peak_win_streak,
        qu.volatility,
        qu.queue_join_time
      FROM queue_users qu
      LEFT JOIN users u ON qu.user_id = u.user_id
      LEFT JOIN queues q ON qu.queue_id = q.id
      ORDER BY qu.queue_id, qu.elo DESC
    `)
    console.log(`[CSV Export] Fetched ${queueUsersResult.rows.length} queue users in ${Date.now() - queueUsersStart}ms`)

    // Calculate stats for each queue user (more efficient than a complex join)
    console.log('[CSV Export] Calculating user statistics...')
    const statsStart = Date.now()
    const statsResult = await pool.query<{
      user_id: string
      queue_id: number
      wins: number
      losses: number
      games_played: number
    }>(`
      SELECT
        mu.user_id,
        m.queue_id,
        COUNT(CASE WHEN m.winning_team = mu.team THEN 1 END)::integer as wins,
        COUNT(CASE WHEN m.winning_team IS NOT NULL AND m.winning_team != mu.team THEN 1 END)::integer as losses,
        COUNT(CASE WHEN m.winning_team IS NOT NULL THEN 1 END)::integer as games_played
      FROM match_users mu
      JOIN matches m ON m.id = mu.match_id
      GROUP BY mu.user_id, m.queue_id
    `)

    // Create a lookup map for stats
    const statsMap = new Map<string, { wins: number; losses: number; games_played: number }>()
    for (const stat of statsResult.rows) {
      statsMap.set(`${stat.user_id}_${stat.queue_id}`, {
        wins: stat.wins,
        losses: stat.losses,
        games_played: stat.games_played
      })
    }

    // Merge stats with queue users
    const queueUsersWithStats: QueueUserData[] = queueUsersResult.rows.map(user => {
      const stats = statsMap.get(`${user.user_id}_${user.queue_id}`) || { wins: 0, losses: 0, games_played: 0 }
      return { ...user, ...stats }
    })
    console.log(`[CSV Export] Calculated statistics in ${Date.now() - statsStart}ms`)

    // Generate CSV strings
    console.log('[CSV Export] Generating CSV files...')
    const csvStart = Date.now()

    const matchesCsv = arrayToCsv(matchesResult.rows, [
      'match_id',
      'queue_id',
      'queue_name',
      'channel_id',
      'created_at',
      'winning_team',
      'best_of_3',
      'best_of_5',
      'deck',
      'stake',
    ])

    const matchUsersCsv = arrayToCsv(matchUsersResult.rows, [
      'match_id',
      'user_id',
      'display_name',
      'team',
      'elo_change',
    ])

    const queueUsersCsv = arrayToCsv(queueUsersWithStats, [
      'user_id',
      'display_name',
      'queue_id',
      'queue_name',
      'elo',
      'peak_elo',
      'wins',
      'losses',
      'games_played',
      'win_streak',
      'peak_win_streak',
      'volatility',
      'queue_join_time',
    ])
    console.log(`[CSV Export] Generated CSV files in ${Date.now() - csvStart}ms`)

    // Generate summary statistics
    const totalMatches = matchesResult.rows.length
    const totalQueueUsers = queueUsersWithStats.length
    const totalGamesPlayed = queueUsersWithStats.reduce((sum, user) => sum + user.games_played, 0)

    const summary = [
      'Season Summary',
      `Export Date: ${new Date().toISOString()}`,
      `Total Matches: ${totalMatches}`,
      `Total Queue Users: ${totalQueueUsers}`,
      `Total Games Played: ${totalGamesPlayed}`,
      '',
    ].join('\n')

    const totalTime = Date.now() - startTime
    console.log(`[CSV Export] Export complete in ${totalTime}ms`)

    return {
      matches: matchesCsv,
      matchUsers: matchUsersCsv,
      queueUsers: queueUsersCsv,
      summary,
    }
  } catch (error) {
    console.error('Error exporting season data:', error)
    throw error
  }
}

/**
 * Combines all CSV data into a single file with sections
 */
export function combineSeasonData(data: {
  matches: string
  matchUsers: string
  queueUsers: string
  summary: string
}): string {
  return [
    '=== SEASON SUMMARY ===',
    data.summary,
    '',
    '',
    '=== MATCHES ===',
    data.matches,
    '',
    '',
    '=== MATCH USERS ===',
    data.matchUsers,
    '',
    '',
    '=== QUEUE USERS ===',
    data.queueUsers,
  ].join('\n')
}

/**
 * Import NeatQueue data into NKQueue
 *
 * This script fetches leaderboard data from NeatQueue API and imports it into the database.
 *
 * Usage:
 *   npx ts-node src/scripts/import-neatqueue-data.ts
 */

import { pool } from '../db'
import readline from 'readline'

const NEATQUEUE_API_URL = 'https://api.neatqueue.com/api'
const NEATQUEUE_API_V1_URL = 'https://api.neatqueue.com/api/v1'
const BMM_SERVER_ID = '1226193436521267223'
const SEASON_START_DATE = new Date('2025-09-01T05:00:00.000Z')

interface NeatQueuePlayerData {
  mmr: number
  wins: number
  losses: number
  streak: number
  totalgames: number
  decay: number
  ign: string | null
  peak_mmr: number
  peak_streak: number
  rank: number
  winrate: number
  current_rank: number
}

interface NeatQueuePlayer {
  id: string // Discord user ID
  data: NeatQueuePlayerData
  name: string
  avatar_url: string
  color: string
}

interface NeatQueueResponse {
  alltime: NeatQueuePlayer[]
}

interface NeatQueueMatchPlayer {
  id: string
  name: string
  mmr: number
  team_num: number
  mmr_change: number
}

interface NeatQueueMatch {
  game: string
  time: string // ISO timestamp
  teams: NeatQueueMatchPlayer[][]
  winner: number // Team number that won (-1 if no winner/tie)
  game_num: number
  mmr_change: any[] // [change_amount, ...]
  queue_channel: string // The channel ID this match was played in
}

// Prompt user for input
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function fetchNeatQueueData(
  rankedChannelId: string,
): Promise<NeatQueueResponse | null> {
  const url = `${NEATQUEUE_API_URL}/leaderboard/${BMM_SERVER_ID}/${rankedChannelId}`

  console.log(`Fetching data from: ${url}`)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return data as NeatQueueResponse
  } catch (error) {
    console.error('Error fetching NeatQueue data:', error)
    return null
  }
}

async function importData(
  players: NeatQueuePlayer[],
  targetQueueId: number,
  dryRun: boolean,
) {
  console.log(
    `\n${dryRun ? '[DRY RUN] ' : ''}Importing ${players.length} players into queue ${targetQueueId}...\n`,
  )

  let successCount = 0
  let errorCount = 0
  let skippedCount = 0

  for (const player of players) {
    try {
      const userId = player.id
      const mmr = player.data.mmr.toFixed(1)
      const peakMmr = player.data.peak_mmr.toFixed(1)
      const winStreak = player.data.streak
      const peakWinStreak = Math.max(
        Math.abs(player.data.peak_streak),
        Math.abs(winStreak),
      )

      if (dryRun) {
        console.log(
          `[DRY RUN] Would import: ${player.name} (${userId}) - MMR: ${mmr}, Peak: ${peakMmr}, Streak: ${winStreak}`,
        )
        successCount++
        continue
      }

      // Check if user already exists in this queue
      const existingUser = await pool.query(
        'SELECT * FROM queue_users WHERE user_id = $1 AND queue_id = $2',
        [userId, targetQueueId],
      )

      if (existingUser.rowCount && existingUser.rowCount > 0) {
        console.log(`⚠️  Skipping ${player.name} - already exists in queue`)
        skippedCount++
        continue
      }

      // Insert into users table
      await pool.query(
        'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [userId],
      )

      // Insert into queue_users table
      await pool.query(
        `INSERT INTO queue_users
         (user_id, elo, peak_elo, queue_id, volatility, win_streak, peak_win_streak)
         VALUES ($1, $2, $3, $4, 10, $5, $6)
         ON CONFLICT (user_id, queue_id) DO UPDATE SET
           elo = EXCLUDED.elo,
           peak_elo = GREATEST(queue_users.peak_elo, EXCLUDED.peak_elo),
           win_streak = EXCLUDED.win_streak,
           peak_win_streak = GREATEST(queue_users.peak_win_streak, EXCLUDED.peak_win_streak)`,
        [userId, mmr, peakMmr, targetQueueId, winStreak, peakWinStreak],
      )

      console.log(
        `✅ Imported: ${player.name} - MMR: ${mmr}, Peak: ${peakMmr}, Streak: ${winStreak}`,
      )
      successCount++
    } catch (error) {
      console.error(`❌ Error importing ${player.name}:`, error)
      errorCount++
    }
  }

  console.log('\n=== Player Import Summary ===')
  console.log(`✅ Successfully imported: ${successCount}`)
  console.log(`⚠️  Skipped (already exists): ${skippedCount}`)
  console.log(`❌ Failed: ${errorCount}`)
  console.log(`📊 Total: ${players.length}`)
}

async function fetchMatchHistory(serverId: string): Promise<NeatQueueMatch[]> {
  const url = `${NEATQUEUE_API_V1_URL}/history/${serverId}?start_date=${SEASON_START_DATE.toISOString()}`
  console.log(`\nFetching match history from: ${url}`)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return (data.data || []) as NeatQueueMatch[]
  } catch (error) {
    console.error('Error fetching match history:', error)
    return []
  }
}

async function importMatchHistory(
  matches: NeatQueueMatch[],
  queueId: number,
  rankedChannelId: string,
  dryRun: boolean,
) {
  console.log(
    `\n${dryRun ? '[DRY RUN] ' : ''}Importing ${matches.length} matches into queue ${queueId}...\n`,
  )

  let successCount = 0
  let errorCount = 0
  let skippedCount = 0

  // Filter matches based on criteria:
  // 1. Has a winner (no ties)
  // 2. From the correct ranked channel
  // 3. After Season 4 start date
  // 4. At least one player has non-zero MMR change
  const completedMatches = matches.filter((m) => {
    if (m.winner < 0) return false // No ties
    if (m.queue_channel !== rankedChannelId) return false // Only from ranked channel
    const matchDate = new Date(m.time)
    if (matchDate < SEASON_START_DATE) return false // Only Season 4+
    const hasNonZeroMmrChange = m.teams.flat().some((player) => player.mmr_change !== 0)
    if (!hasNonZeroMmrChange) return false // Skip matches where all players have 0 MMR change
    return true
  })

  console.log(
    `Filtered ${completedMatches.length} valid matches out of ${matches.length} total`,
  )
  console.log(
    `  - Matches with winners: ${matches.filter((m) => m.winner >= 0).length}`,
  )
  console.log(
    `  - From ranked channel: ${matches.filter((m) => m.queue_channel === rankedChannelId).length}`,
  )
  console.log(
    `  - After ${SEASON_START_DATE.toISOString()}: ${matches.filter((m) => new Date(m.time) >= SEASON_START_DATE).length}`,
  )

  for (const match of completedMatches) {
    try {
      if (dryRun) {
        const players = match.teams.flat()
        const playerNames = players.map((p) => p.name).join(', ')
        console.log(
          `[DRY RUN] Would import match #${match.game_num}: ${playerNames} (Winner: Team ${match.winner})`,
        )
        successCount++
        continue
      }

      // Create match in database
      const matchResult = await pool.query(
        `INSERT INTO matches (queue_id, channel_id, open, winning_team, created_at)
         VALUES ($1, $2, false, $3, $4)
         RETURNING id`,
        [queueId, `neatqueue-${match.game_num}`, match.winner + 1, match.time],
      )

      const matchId = matchResult.rows[0].id

      // Insert match users
      for (const team of match.teams) {
        for (const player of team) {
          const mmrChange = parseFloat((player.mmr_change || 0).toFixed(1))

          // Ensure user exists in users table
          await pool.query(
            'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
            [player.id],
          )

          await pool.query(
            `INSERT INTO match_users (match_id, user_id, team, elo_change)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [matchId, player.id, player.team_num + 1, mmrChange],
          )
        }
      }

      successCount++
      if (successCount % 50 === 0) {
        console.log(`  Imported ${successCount} matches...`)
      }
    } catch (error: any) {
      // Skip if match already exists (channel_id conflict)
      if (error.code === '23505') {
        skippedCount++
        continue
      }
      console.error(`❌ Error importing match #${match.game_num}:`, error)
      errorCount++
    }
  }

  console.log('\n=== Match Import Summary ===')
  console.log(`✅ Successfully imported: ${successCount}`)
  console.log(`⚠️  Skipped (already exists): ${skippedCount}`)
  console.log(`❌ Failed: ${errorCount}`)
  console.log(`📊 Total valid matches (filtered): ${completedMatches.length}`)
  console.log(
    `\nNote: Only imported matches from ranked channel with winners (no ties) after ${SEASON_START_DATE.toLocaleDateString()}`,
  )
}

async function clearTables(queueId: number, dryRun: boolean) {
  console.log(
    `\n${dryRun ? '[DRY RUN] ' : ''}Clearing tables for queue ${queueId}...\n`,
  )

  if (dryRun) {
    console.log('[DRY RUN] Would delete:')
    console.log('  - match_users for matches in this queue')
    console.log('  - matches for this queue')
    console.log('  - queue_users for this queue')
    console.log('  - users with no remaining queue associations')
    return
  }

  try {
    // Delete in order to respect foreign key constraints
    // 1. Delete match_users for matches in this queue
    const matchUsersResult = await pool.query(
      `DELETE FROM match_users WHERE match_id IN (SELECT id FROM matches WHERE queue_id = $1)`,
      [queueId],
    )
    console.log(`✅ Deleted ${matchUsersResult.rowCount} match_users records`)

    // 2. Delete matches for this queue
    const matchesResult = await pool.query(
      `DELETE FROM matches WHERE queue_id = $1`,
      [queueId],
    )
    console.log(`✅ Deleted ${matchesResult.rowCount} matches`)

    // 3. Delete queue_users for this queue
    const queueUsersResult = await pool.query(
      `DELETE FROM queue_users WHERE queue_id = $1`,
      [queueId],
    )
    console.log(`✅ Deleted ${queueUsersResult.rowCount} queue_users`)

    // 4. Delete users that no longer have any queue associations
    const usersResult = await pool.query(
      `DELETE FROM users WHERE user_id NOT IN (SELECT DISTINCT user_id FROM queue_users)`,
    )
    console.log(
      `✅ Deleted ${usersResult.rowCount} users with no queue associations`,
    )

    console.log('\n✅ Tables cleared successfully')
  } catch (error) {
    console.error('❌ Error clearing tables:', error)
    throw error
  }
}

async function main() {
  console.log('=== NeatQueue Data Import Tool ===\n')

  // Prompt for RANKED_CHANNEL ID
  const rankedChannelId = await prompt(
    'Enter the NeatQueue RANKED_CHANNEL ID: ',
  )

  if (!rankedChannelId) {
    console.error('❌ Error: RANKED_CHANNEL ID is required.')
    process.exit(1)
  }

  // Prompt for target queue ID
  const targetQueueIdStr = await prompt(
    'Enter the target NKQueue queue ID (default: 1): ',
  )
  const targetQueueId = targetQueueIdStr ? parseInt(targetQueueIdStr) : 1

  if (isNaN(targetQueueId)) {
    console.error('❌ Error: Invalid queue ID.')
    process.exit(1)
  }

  // Ask if we should clear existing data
  const clearDataAnswer = await prompt(
    'Clear existing data for this queue before import? (y/n, default: n): ',
  )
  const shouldClearData = clearDataAnswer.toLowerCase() === 'y'

  // Ask what to import
  const importTypeAnswer = await prompt(
    'What to import? (1=Players only, 2=Matches only, 3=Both, default: 3): ',
  )
  const importType = importTypeAnswer || '3'

  // Ask if this is a dry run
  const dryRunAnswer = await prompt('Dry run? (y/n, default: y): ')
  const dryRun = !dryRunAnswer || dryRunAnswer.toLowerCase() !== 'n'

  // Clear tables if requested
  if (shouldClearData) {
    if (!dryRun) {
      const confirmClear = await prompt(
        '\n⚠️  WARNING: This will delete existing data for this queue. Are you sure? (yes/no): ',
      )
      if (confirmClear.toLowerCase() !== 'yes') {
        console.log('Clear cancelled.')
        await pool.end()
        process.exit(0)
      }
    }
    await clearTables(targetQueueId, dryRun)
  }

  // Import players
  if (importType === '1' || importType === '3') {
    const data = await fetchNeatQueueData(rankedChannelId)

    if (!data || !data.alltime || data.alltime.length === 0) {
      console.error('❌ Error: No leaderboard data found.')
      await pool.end()
      process.exit(1)
    }

    console.log(`\n✅ Fetched ${data.alltime.length} players from NeatQueue`)

    // Show sample data
    console.log('\n=== Sample Data (first 3 players) ===')
    data.alltime.slice(0, 3).forEach((player, idx) => {
      console.log(
        `${idx + 1}. ${player.name} - MMR: ${Math.round(player.data.mmr)}, Peak: ${Math.round(player.data.peak_mmr)}, W/L: ${player.data.wins}/${player.data.losses}`,
      )
    })

    // Confirm before proceeding
    if (!dryRun) {
      const confirm = await prompt(
        '\n⚠️  This will import player data into your database. Continue? (yes/no): ',
      )
      if (confirm.toLowerCase() !== 'yes') {
        console.log('Import cancelled.')
        await pool.end()
        process.exit(0)
      }
    }

    // Import the player data
    await importData(data.alltime, targetQueueId, dryRun)
  }

  // Import match history
  if (importType === '2' || importType === '3') {
    const matches = await fetchMatchHistory(BMM_SERVER_ID)

    if (matches.length === 0) {
      console.warn('⚠️  No match history found.')
    } else {
      console.log(`\n✅ Fetched ${matches.length} matches from NeatQueue`)

      // Show sample match
      if (matches.length > 0) {
        const sample = matches[0]
        const players = sample.teams.flat()
        console.log('\n=== Sample Match ===')
        console.log(
          `Match #${sample.game_num} - ${sample.time} - Winner: Team ${sample.winner}`,
        )
        console.log(`Players: ${players.map((p) => p.name).join(', ')}`)
      }

      // Confirm before proceeding
      if (!dryRun) {
        const confirm = await prompt(
          '\n⚠️  This will import match history into your database. Continue? (yes/no): ',
        )
        if (confirm.toLowerCase() !== 'yes') {
          console.log('Import cancelled.')
          await pool.end()
          process.exit(0)
        }
      }

      // Import match history
      await importMatchHistory(matches, targetQueueId, rankedChannelId, dryRun)
    }
  }

  // Close database connection
  await pool.end()

  console.log('\n✅ Import complete!')

  if (dryRun) {
    console.log(
      '\n💡 This was a dry run. Run again and answer "n" to dry run to actually import the data.',
    )
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  pool
    .end()
    .then((_) => console.log(`Database connection closed.`))
    .catch((e) => console.error('Error closing database connection:', e))
  process.exit(1)
})

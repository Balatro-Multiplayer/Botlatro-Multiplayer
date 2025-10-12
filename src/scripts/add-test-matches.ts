import { pool } from '../db'

async function addTestMatches() {
  const userId = process.argv[2]
  const queueId = parseInt(process.argv[3])
  const numMatches = parseInt(process.argv[4]) || 50

  if (!userId || !queueId) {
    console.error(
      'Usage: bun src/scripts/add-test-matches.ts <userId> <queueId> [numMatches]',
    )
    process.exit(1)
  }

  console.log(
    `Adding ${numMatches} test matches for user ${userId} in queue ${queueId}...`,
  )

  // Get queue settings
  const queueSettings = await pool.query(
    'SELECT default_elo FROM queues WHERE id = $1',
    [queueId],
  )

  if (queueSettings.rowCount === 0) {
    console.error(`Queue ${queueId} not found`)
    process.exit(1)
  }

  const defaultElo = queueSettings.rows[0].default_elo

  // Ensure user exists in queue_users
  await pool.query(
    `INSERT INTO queue_users (user_id, queue_id, elo, peak_elo, win_streak, peak_win_streak)
     VALUES ($1, $2, $3, $3, 0, 0)
     ON CONFLICT (user_id, queue_id) DO NOTHING`,
    [userId, queueId, defaultElo],
  )

  await pool.query(
    `
    INSERT INTO users (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
  `,
    ['dummy-opponent'],
  )

  await pool.query(
    `INSERT INTO queue_users (user_id, queue_id, elo, peak_elo, win_streak, peak_win_streak)
     VALUES ($1, $2, $3, $3, 0, 0)
     ON CONFLICT (user_id, queue_id) DO NOTHING`,
    ['dummy-opponent', queueId, defaultElo],
  )

  let currentElo = defaultElo
  let peakElo = defaultElo
  let currentStreak = 0

  for (let i = 0; i < numMatches; i++) {
    // Random win/loss with 55% win rate
    const won = Math.random() < 0.55
    const winningTeam = won ? 1 : 2
    const userTeam = 1

    // Random elo change between -30 and +30
    const baseChange = Math.floor(Math.random() * 30) + 10
    const eloChange = won ? baseChange : -baseChange
    currentElo += eloChange
    peakElo = Math.max(peakElo, currentElo)

    // Update streak
    if (won) {
      currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1
    } else {
      currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1
    }

    // Create match
    const matchResult = await pool.query(
      `INSERT INTO matches (queue_id, channel_id, winning_team, open, created_at)
       VALUES ($1, $2, $3, false, NOW() - INTERVAL '${i} hours')
       RETURNING id`,
      [queueId, `test-channel-${queueId}-${i}`, winningTeam],
    )

    const matchId = matchResult.rows[0].id

    // Add user to match_users
    await pool.query(
      `INSERT INTO match_users (match_id, user_id, team, elo_change)
       VALUES ($1, $2, $3, $4)`,
      [matchId, userId, userTeam, eloChange],
    )

    // Add dummy opponent
    await pool.query(
      `INSERT INTO match_users (match_id, user_id, team, elo_change)
       VALUES ($1, $2, $3, $4)`,
      [matchId, 'dummy-opponent', userTeam === 1 ? 2 : 1, -eloChange],
    )

    // Update user's elo and streak in queue_users after each match
    // Clamp elo to prevent going below 0
    const clampedElo = Math.max(0, Math.min(9999, Math.round(currentElo)))
    await pool.query(
      `UPDATE queue_users
       SET elo = $1::integer,
           peak_elo = GREATEST(peak_elo, $1::integer),
           win_streak = $2::integer,
           peak_win_streak = GREATEST(peak_win_streak, ABS($2))
       WHERE user_id = $3 AND queue_id = $4`,
      [clampedElo, currentStreak, userId, queueId],
    )

    if (i % 10 === 0) {
      console.log(`Created ${i + 1}/${numMatches} matches...`)
    }
  }

  // Update user's final elo and streak
  // Clamp elo to prevent going below 0
  const finalClampedElo = Math.max(0, Math.min(9999, Math.round(currentElo)))
  const finalPeakElo = Math.max(0, Math.min(9999, Math.round(peakElo)))
  await pool.query(
    `UPDATE queue_users
     SET elo = $1::integer,
         peak_elo = $2::integer,
         win_streak = $3::integer,
         peak_win_streak = GREATEST(peak_win_streak, ABS($3))
     WHERE user_id = $4 AND queue_id = $5`,
    [finalClampedElo, finalPeakElo, currentStreak, userId, queueId],
  )

  console.log(`✓ Successfully created ${numMatches} test matches!`)
  console.log(
    `Final ELO: ${currentElo} (${currentElo - defaultElo > 0 ? '+' : ''}${currentElo - defaultElo})`,
  )
  console.log(`Current streak: ${currentStreak}`)

  process.exit(0)
}

addTestMatches().catch((err) => {
  console.error('Error creating test matches:', err)
  process.exit(1)
})

import '../register-paths'
import { pool } from '../db'
import * as dotenv from 'dotenv'

dotenv.config()

/**
 * Backfill script to populate mmr_after for all existing match_users records
 * This calculates the MMR at the time of each match using the cumulative elo_change
 */
async function backfillMmrAfter() {
  try {
    console.log('Starting mmr_after backfill...')

    // Get count of records needing backfill
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM match_users WHERE mmr_after IS NULL AND elo_change IS NOT NULL',
    )
    const totalRecords = parseInt(countResult.rows[0].count)

    console.log(`Found ${totalRecords} match_users records to backfill`)

    if (totalRecords === 0) {
      console.log('No records to backfill!')
      await pool.end()
      process.exit(0)
    }

    // Process in batches to avoid memory issues
    const batchSize = 1000
    let processedCount = 0
    let errorCount = 0

    console.log(`Processing in batches of ${batchSize}...`)

    while (processedCount < totalRecords) {
      try {
        // Calculate mmr_after using window function and update in a single query
        const result = await pool.query(`
          WITH user_current_elo AS (
            SELECT user_id, elo, queue_id
            FROM queue_users
          ),
          match_elo_changes AS (
            SELECT
              mu.match_id,
              mu.user_id,
              mu.elo_change,
              m.created_at,
              m.queue_id,
              SUM(mu.elo_change) OVER (
                PARTITION BY mu.user_id, m.queue_id
                ORDER BY m.created_at DESC, m.id DESC
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              ) as cumulative_change_from_now
            FROM match_users mu
            JOIN matches m ON mu.match_id = m.id
            WHERE m.winning_team IS NOT NULL
              AND mu.mmr_after IS NULL
              AND mu.elo_change IS NOT NULL
            LIMIT $1 OFFSET $2
          ),
          calculated_mmr AS (
            SELECT
              mec.match_id,
              mec.user_id,
              uce.elo - mec.cumulative_change_from_now + mec.elo_change as mmr_after
            FROM match_elo_changes mec
            JOIN user_current_elo uce ON mec.user_id = uce.user_id AND mec.queue_id = uce.queue_id
          )
          UPDATE match_users mu
          SET mmr_after = cm.mmr_after
          FROM calculated_mmr cm
          WHERE mu.match_id = cm.match_id AND mu.user_id = cm.user_id
          RETURNING mu.match_id, mu.user_id
        `, [batchSize, processedCount])

        const updatedCount = result.rowCount || 0
        processedCount += updatedCount

        const progress = ((processedCount / totalRecords) * 100).toFixed(1)
        console.log(`Progress: ${processedCount}/${totalRecords} (${progress}%)`)

        // If no rows were updated, we're done
        if (updatedCount === 0) {
          break
        }
      } catch (err) {
        errorCount++
        console.error(`Error processing batch starting at ${processedCount}:`, err)
        // Continue to next batch even if this one failed
        processedCount += batchSize
      }
    }

    console.log('\nBackfill complete!')
    console.log(`Successfully processed: ${processedCount}`)
    console.log(`Errors: ${errorCount}`)

    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error('Fatal error during backfill:', err)
    await pool.end()
    process.exit(1)
  }
}

// Run the backfill
backfillMmrAfter()

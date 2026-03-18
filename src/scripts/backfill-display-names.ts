import '../register-paths'
import { pool } from '../db'
import { client, getGuild } from '../client'
import * as dotenv from 'dotenv'

dotenv.config()

/**
 * Backfill script to populate display_name for all existing users
 * This script fetches all users from the database and updates their display_name
 * by fetching their current display name from Discord
 */
async function backfillDisplayNames() {
  try {
    console.log('Starting display name backfill...')

    // Get all users from the database
    const result = await pool.query(
      'SELECT user_id FROM users WHERE display_name IS NULL',
    )
    const users = result.rows

    console.log(`Found ${users.length} users without display names`)

    if (users.length === 0) {
      console.log('No users to backfill!')
      return
    }

    let successCount = 0
    let errorCount = 0

    // Process each user
    for (const user of users) {
      try {
        // Fetch the user from Discord
        const discordUser = await client.users.fetch(user.user_id)

        // Get the display name from guilds (try to get server nickname if possible)
        let displayName = discordUser.username

        const guild = await getGuild()

        // Try to get the member from guilds to get server nickname
        try {
          const member = await guild.members.fetch(user.user_id)
          if (member) {
            displayName = member.displayName
            break
          }
        } catch (err) {}

        // Update the database
        await pool.query(
          'UPDATE users SET display_name = $1 WHERE user_id = $2',
          [displayName, user.user_id],
        )

        successCount++
        console.log(`✓ Updated ${user.user_id}: ${displayName}`)
      } catch (err) {
        errorCount++
        console.error(`✗ Error updating ${user.user_id}:`, err)
      }
    }

    console.log('\nBackfill complete!')
    console.log(`Successfully updated: ${successCount}`)
    console.log(`Errors: ${errorCount}`)

    // Close connections
    await client.destroy()
    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error('Fatal error during backfill:', err)
    await client.destroy()
    await pool.end()
    process.exit(1)
  }
}

// Run the backfill
backfillDisplayNames()

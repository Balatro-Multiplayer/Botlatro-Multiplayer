import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { pool } from '../../db'

export default {
  data: new SlashCommandBuilder()
    .setName('backfill-display-names')
    .setDescription('[ADMIN] Backfills display names for all users in the database')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      // Get all users from the database without display names
      const result = await pool.query('SELECT user_id FROM users WHERE display_name IS NULL')
      const users = result.rows

      if (users.length === 0) {
        await interaction.editReply({
          content: 'All users already have display names! Nothing to backfill.',
        })
        return
      }

      await interaction.editReply({
        content: `Found ${users.length} users without display names. Starting backfill...\nThis may take a while.`,
      })

      let successCount = 0
      let errorCount = 0
      const errors: string[] = []

      // Process each user
      for (let i = 0; i < users.length; i++) {
        const user = users[i]
        try {
          // Try to fetch the user from Discord
          const discordUser = await interaction.client.users.fetch(user.user_id)

          // Get display name from the current guild if possible
          let displayName = discordUser.username

          if (interaction.guild) {
            try {
              const member = await interaction.guild.members.fetch(user.user_id)
              if (member) {
                displayName = member.displayName
              }
            } catch {
              // User might not be in this guild, use username
            }
          }

          // Update the database
          await pool.query(
            'UPDATE users SET display_name = $1 WHERE user_id = $2',
            [displayName, user.user_id]
          )

          successCount++

          // Send progress update every 10 users
          if ((i + 1) % 10 === 0) {
            await interaction.editReply({
              content: `Progress: ${i + 1}/${users.length} users processed...\nSuccessful: ${successCount}\nErrors: ${errorCount}`,
            })
          }
        } catch (err: any) {
          errorCount++
          errors.push(`${user.user_id}: ${err.message}`)
          console.error(`Error updating ${user.user_id}:`, err)
        }
      }

      // Final report
      let finalMessage = `✅ Backfill complete!\n\n**Results:**\n- Successfully updated: ${successCount}\n- Errors: ${errorCount}\n- Total processed: ${users.length}`

      if (errors.length > 0 && errors.length <= 5) {
        finalMessage += `\n\n**Errors:**\n${errors.map(e => `- ${e}`).join('\n')}`
      } else if (errors.length > 5) {
        finalMessage += `\n\n**Errors:** Too many to display (${errors.length} total). Check console logs.`
      }

      await interaction.editReply({
        content: finalMessage,
      })
    } catch (err: any) {
      console.error('Error during backfill:', err)
      const errorMsg = err.detail || err.message || 'Unknown error'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ Failed to backfill display names. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `❌ Failed to backfill display names. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

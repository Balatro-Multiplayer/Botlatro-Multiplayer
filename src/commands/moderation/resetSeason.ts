import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { pool } from '../../db'
import { exportSeasonData, combineSeasonData } from '../../utils/csvExport'

export default {
  data: new SlashCommandBuilder()
    .setName('reset-season')
    .setDescription('[ADMIN] Reset the season. WARNING: IRREVERSIBLE!')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('password')
        .setDescription('Type in "confirm_reset" to confirm reset')
        .setRequired(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const password = interaction.options.getString('password', true)
    if (password !== 'confirm_reset') {
      return interaction.editReply({ content: 'Incorrect password.' })
    }

    try {
      console.log('[Reset Season] Starting season reset process...')

      // Export all season data before deletion
      await interaction.editReply({
        content:
          '**Step 1/4:** Exporting season data to CSV...\n_This may take a moment for large datasets._',
      })

      const exportStart = Date.now()
      const seasonData = await exportSeasonData()
      console.log(
        `[Reset Season] Export completed in ${Date.now() - exportStart}ms`,
      )

      await interaction.editReply({
        content: '**Step 2/4:** Generating CSV file...',
      })

      const csvContent = combineSeasonData(seasonData)

      // Create the CSV file as a buffer
      const buffer = Buffer.from(csvContent, 'utf-8')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const attachment = new AttachmentBuilder(buffer, {
        name: `season-export-${timestamp}.csv`,
      })
      console.log(
        `[Reset Season] CSV file generated (${(buffer.length / 1024).toFixed(2)} KB)`,
      )

      // Delete all matches and queue users
      await interaction.editReply({
        content:
          '**Step 3/4:** Deleting season data from database...\n_Deleting match users, matches, and queue users._',
      })

      const deleteStart = Date.now()
      const matchUsersResult = await pool.query('DELETE FROM match_users')
      console.log(
        `[Reset Season] Deleted ${matchUsersResult.rowCount} match_users entries`,
      )

      const matchesResult = await pool.query('DELETE FROM matches')
      console.log(`[Reset Season] Deleted ${matchesResult.rowCount} matches`)

      const queueUsersResult = await pool.query('DELETE FROM queue_users')
      console.log(
        `[Reset Season] Deleted ${queueUsersResult.rowCount} queue_users entries`,
      )

      console.log(
        `[Reset Season] Database cleanup completed in ${Date.now() - deleteStart}ms`,
      )

      // Send success message with the CSV file attached
      await interaction.editReply({
        content: `**Step 4/4:** Complete!\n\nSuccessfully reset the season. **THIS CANNOT BE REVERSED.**\n\nSeason data has been exported and attached as a CSV file.\n\n**Summary:**\n${seasonData.summary}\n**Deleted:**\n- ${matchUsersResult.rowCount} match user entries\n- ${matchesResult.rowCount} matches\n- ${queueUsersResult.rowCount} queue user entries`,
        files: [attachment],
      })

      console.log('[Reset Season] Season reset completed successfully')
    } catch (err: any) {
      console.error('[Reset Season] Error resetting season:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      await interaction.editReply({
        content: `Failed to reset season.\n\n**Error:** ${errorMessage}\n\nPlease check the logs for more details.`,
      })
    }
  },
}

import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { pool } from '../../db'
import { getActiveSeason } from '../../utils/queryDB'

export default {
  data: new SlashCommandBuilder()
    .setName('reset-season')
    .setDescription(
      '[ADMIN] Advance to the next season. Snapshots current stats and resets MMR.',
    )
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
      const currentSeason = await getActiveSeason()
      const newSeason = currentSeason + 1

      console.log(
        `[Reset Season] Starting season transition: ${currentSeason} -> ${newSeason}`,
      )

      // Step 1: Snapshot queue_users into queue_users_seasons
      await interaction.editReply({
        content: `**Step 1/3:** Snapshotting season ${currentSeason} stats...`,
      })

      const snapshotResult = await pool.query(
        `
        INSERT INTO queue_users_seasons (user_id, queue_id, season, elo, peak_elo, win_streak, peak_win_streak, volatility)
        SELECT user_id, queue_id, $1, elo, peak_elo, win_streak, peak_win_streak, volatility
        FROM queue_users
        ON CONFLICT (user_id, queue_id, season) DO UPDATE SET
          elo = EXCLUDED.elo,
          peak_elo = EXCLUDED.peak_elo,
          win_streak = EXCLUDED.win_streak,
          peak_win_streak = EXCLUDED.peak_win_streak,
          volatility = EXCLUDED.volatility
        `,
        [currentSeason],
      )
      console.log(
        `[Reset Season] Snapshotted ${snapshotResult.rowCount} queue_users entries for season ${currentSeason}`,
      )

      // Step 2: Reset queue_users to defaults
      await interaction.editReply({
        content: `**Step 2/3:** Resetting all players to default MMR for season ${newSeason}...`,
      })

      const resetResult = await pool.query(
        `
        UPDATE queue_users qu
        SET elo = q.default_elo,
            peak_elo = q.default_elo,
            win_streak = 0,
            peak_win_streak = 0,
            volatility = NULL,
            is_decay = false,
            last_decay = NULL
        FROM queues q
        WHERE qu.queue_id = q.id
        `,
      )
      console.log(
        `[Reset Season] Reset ${resetResult.rowCount} queue_users entries to defaults`,
      )

      // Step 3: Increment active_season and update matches default
      await pool.query(
        `UPDATE settings SET active_season = $1 WHERE singleton = true`,
        [newSeason],
      )
      console.log(`[Reset Season] Active season set to ${newSeason}`)

      await pool.query(
        `ALTER TABLE matches ALTER COLUMN season SET DEFAULT ${newSeason}`,
      )
      console.log(`[Reset Season] Matches default season set to ${newSeason}`)

      await interaction.editReply({
        content: `**Step 3/3:** Complete!\n\nSeason **${currentSeason}** has been archived and season **${newSeason}** has begun.\n\n**Actions taken:**\n- Snapshotted ${snapshotResult.rowCount} player stats for season ${currentSeason}\n- Reset ${resetResult.rowCount} players to default MMR\n- Active season is now **${newSeason}**`,
      })

      console.log('[Reset Season] Season transition completed successfully')
    } catch (err: any) {
      console.error('[Reset Season] Error resetting season:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      await interaction.editReply({
        content: `Failed to reset season.\n\n**Error:** ${errorMessage}\n\nPlease check the logs for more details.`,
      })
    }
  },
}

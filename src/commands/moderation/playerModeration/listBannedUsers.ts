import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../../db'
import { Bans } from 'psqlDB'
import {
  createModerationListEmbed,
  formatBanLogEntry,
} from './moderationLogUtils'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const bannedUsers: Bans[] = (await pool.query(`SELECT * FROM "bans"`))
        .rows

      const sortedBans = [...bannedUsers].sort((a, b) => {
        const aTime = a.expires_at
          ? new Date(a.expires_at).getTime()
          : Number.POSITIVE_INFINITY
        const bTime = b.expires_at
          ? new Date(b.expires_at).getTime()
          : Number.POSITIVE_INFINITY

        return aTime - bTime
      })

      const embed = createModerationListEmbed({
        title: 'Ban Log',
        summary: `Active bans: ${sortedBans.length}`,
        emptyState: 'No active bans.',
        entries: sortedBans.map(formatBanLogEntry),
      })

      await interaction.editReply({ embeds: [embed] })
    } catch (err: any) {
      console.error(err)
    }
  },
}

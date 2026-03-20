import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../../db'
import { Bans } from 'psqlDB'
import {
  createModerationListEmbed,
  formatBanLogEntry,
} from './moderationLogUtils'
import { resolveModerationTarget } from '../../../command-handlers/moderation/resolveModerationTarget'

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
      const targetEntries = await Promise.all(
        sortedBans.map(
          async (ban): Promise<readonly [string, string]> => [
            ban.user_id,
            (await resolveModerationTarget(ban.user_id)).fullLabel,
          ],
        ),
      )
      const targetLookup = new Map<string, string>(targetEntries)

      const embed = createModerationListEmbed({
        title: 'Ban Log',
        summary: `Active bans: ${sortedBans.length}`,
        emptyState: 'No active bans.',
        entries: sortedBans.map((ban) =>
          formatBanLogEntry(
            ban,
            targetLookup.get(ban.user_id) ?? `${ban.user_id} (<@${ban.user_id}>)`,
          ),
        ),
      })

      await interaction.editReply({ embeds: [embed] })
    } catch (err: any) {
      console.error(err)
    }
  },
}

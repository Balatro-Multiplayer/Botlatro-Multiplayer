import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../../db'
import { Bans } from 'psqlDB'
import {
  createModerationListEmbed,
  formatBanLogEntry,
  isExpired,
} from './moderationLogUtils'
import { resolveModerationTarget } from '../../../command-handlers/moderation/resolveModerationTarget'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const bannedUsers: Bans[] = (await pool.query(`SELECT * FROM "bans"`))
        .rows

      // Active bans first, then expired. Within active, soonest-to-expire
      // first (permanent bans, null expiry, sort last via +Infinity).
      const sortedBans = [...bannedUsers].sort((a, b) => {
        const aExpired = isExpired(a.expires_at)
        const bExpired = isExpired(b.expires_at)
        if (aExpired !== bExpired) return aExpired ? 1 : -1

        const aTime = a.expires_at
          ? new Date(a.expires_at).getTime()
          : Number.POSITIVE_INFINITY
        const bTime = b.expires_at
          ? new Date(b.expires_at).getTime()
          : Number.POSITIVE_INFINITY

        return aTime - bTime
      })
      const activeBanCount = sortedBans.filter(
        (ban) => !isExpired(ban.expires_at),
      ).length
      const expiredBanCount = sortedBans.length - activeBanCount
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
        summary: `Active bans: ${activeBanCount}${expiredBanCount > 0 ? ` · Expired: ${expiredBanCount}` : ''}`,
        emptyState: 'No bans on record.',
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

import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { strikeUtils } from '../../../utils/queryDB'
import { getGuild } from '../../../client'
import {
  createModerationListEmbed,
  formatStrikeLogEntry,
  isExpired,
} from './moderationLogUtils'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const user = interaction.options.getUser('user', true)
      const strikeInfo = await strikeUtils.getUserStrikes(user.id)
      const guild = await getGuild()
      const member =
        guild.members.cache.get(user.id) ?? (await guild.members.fetch(user.id))
      // Active strikes first, then expired; each group newest-first.
      const sortedStrikes = [...strikeInfo].sort((a, b) => {
        const aExpired = isExpired(a.expires_at)
        const bExpired = isExpired(b.expires_at)
        if (aExpired !== bExpired) return aExpired ? 1 : -1
        return new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime()
      })
      const issuedByIds = [
        ...new Set(sortedStrikes.map((strike) => strike.issued_by_id)),
      ]
      const issuedByEntries = await Promise.all(
        issuedByIds.map(async (issuedById) => {
          try {
            const issuedByMember =
              guild.members.cache.get(issuedById) ??
              (await guild.members.fetch(issuedById))
            return [issuedById, issuedByMember.displayName] as const
          } catch {
            return [issuedById, issuedById] as const
          }
        }),
      )
      const issuedByLookup = new Map(issuedByEntries)
      const activeStrikes = sortedStrikes.reduce(
        (total, strike) =>
          isExpired(strike.expires_at) ? total : total + strike.amount,
        0,
      )
      const expiredCount = sortedStrikes.filter((strike) =>
        isExpired(strike.expires_at),
      ).length

      const embed = createModerationListEmbed({
        title: `${member.displayName} Strike Log`,
        summary: `Active strikes: ${activeStrikes} · Entries: ${sortedStrikes.length}${expiredCount > 0 ? ` (${expiredCount} expired)` : ''}`,
        emptyState: 'No strikes found for this user.',
        entries: sortedStrikes.map((strike) =>
          formatStrikeLogEntry(
            strike,
            issuedByLookup.get(strike.issued_by_id) ?? strike.issued_by_id,
          ),
        ),
      })

      await interaction.editReply({ embeds: [embed] })
    } catch (err: any) {
      console.error(err)
    }
  },
}

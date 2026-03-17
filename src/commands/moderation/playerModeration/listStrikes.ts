import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { strikeUtils } from '../../../utils/queryDB'
import { getGuild } from '../../../client'
import {
  createModerationListEmbed,
  formatStrikeLogEntry,
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
      const sortedStrikes = [...strikeInfo].sort(
        (a, b) =>
          new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime(),
      )
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
      const totalStrikes = sortedStrikes.reduce(
        (total, strike) => total + strike.amount,
        0,
      )

      const embed = createModerationListEmbed({
        title: `${member.displayName} Strike Log`,
        summary: `Entries: ${sortedStrikes.length} · Total strikes: ${totalStrikes}`,
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

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import { strikeUtils } from '../../../utils/queryDB'
import { getGuild } from '../../../client'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()
      const user = interaction.options.getUser('user', true)
      const strikeInfo = await strikeUtils.getUserStrikes(user.id)
      const guild = await getGuild()
      const member =
        guild.members.cache.get(user.id) ?? (await guild.members.fetch(user.id))
      const username = member.displayName
      const usernameFormatted =
        username.toLowerCase().slice(-1) === 's'
          ? `${username}'`
          : `${username}'s`

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${usernameFormatted} strikes`)
        .setTimestamp()

      let index = 0
      for (const strike of strikeInfo) {
        const date = strike.issued_at
        const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`

        const blameMember = await guild.members.fetch(strike.issued_by_id)
        const blame = blameMember.displayName
        embed.addFields({
          name: ` `,
          value: `#${index} by ${blame} · ${strike.reason} · #${strike.reference} · ${formattedDate} · (${strike.amount})`,
          inline: false,
        })
        index++
      }

      await interaction.editReply({ embeds: [embed] })
    } catch (err: any) {
      console.error(err)
    }
  },
}

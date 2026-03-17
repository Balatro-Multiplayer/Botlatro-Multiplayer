import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { strikeUtils } from '../../../utils/queryDB'
import {
  createEmbedType,
  formatEmbedField,
  logStrike,
} from '../../../utils/logCommandUse'
import { client } from '../../../client'
import { formatDiscordDate, getGuildDisplayName } from './moderationLogUtils'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const strikeId: string = interaction.options.getString('strike', true)
      const strikeInfo = await strikeUtils.getStrikeFromId(strikeId)
      await strikeUtils.removeStrikeById(strikeId)
      await interaction.editReply({
        content: `strike with id ${strikeId} successfully removed`,
      })

      const blame = await getGuildDisplayName(
        interaction.guild,
        interaction.user.id,
        interaction.user.username,
      )
      const reasonFormat = formatEmbedField(strikeInfo.reason)

      // log usage
      const embed = createEmbedType(
        'STRIKE REMOVED',
        `<@${strikeInfo.user_id}>`,
        65280,
        [
          { name: `Strike`, value: `#${strikeId}`, inline: true },
          { name: `Amount`, value: `${strikeInfo.amount}`, inline: true },
          {
            name: `Issued`,
            value: formatDiscordDate(strikeInfo.issued_at),
            inline: true,
          },
          { name: `Reason`, value: `${reasonFormat}`, inline: false },
          { name: `Reference`, value: `${strikeInfo.reference}`, inline: true },
        ],
        null,
        `${blame}`,
      )
      await logStrike('remove_strike', embed)
    } catch (err: any) {
      console.error(err)
    }
  },
}

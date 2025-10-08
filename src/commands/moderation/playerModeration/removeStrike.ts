import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { strikeUtils } from '../../../utils/queryDB'
import {
  createEmbedType,
  formatEmbedField,
  logStrike,
} from '../../../utils/logCommandUse'
import { client } from '../../../client'

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

      const blame = (await client.users.fetch(interaction.user.id)).username
      const reasonFormat = formatEmbedField(strikeInfo.reason)

      // log usage
      const embed = createEmbedType(
        `#${strikeId} - STRIKE REMOVED`,
        'desc.',
        null, // default
        [
          { name: `Amount`, value: `${strikeInfo.amount}`, inline: true },
          { name: `Reason`, value: `${reasonFormat}`, inline: true },
          { name: `Ref`, value: `<#${strikeInfo.reference}>`, inline: true },
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

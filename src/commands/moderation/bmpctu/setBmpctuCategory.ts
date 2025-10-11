import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { changeBmpctuCategoryDb } from '../../../utils/queryDB'

export default {
  execute: async function (interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const catId = interaction.options.getChannel('category', true).id
      await changeBmpctuCategoryDb(catId)
      await interaction.editReply({ content: 'category successfully set' })
    } catch (err: any) {
      console.error(err)
    }
  },
}

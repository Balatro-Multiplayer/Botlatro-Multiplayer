import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { deleteStrikeById, getStrikeFromId } from '../../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const discordChannel = interaction.channel
      const strikeId = interaction.options.getString('user', true)
      const s = await getStrikeFromId(strikeId)
      await deleteStrikeById(strikeId)
    } catch (err: any) {
      console.error(err)
    }
  },
}

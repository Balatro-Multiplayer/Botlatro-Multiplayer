import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { changeRoomLogChannel } from '../../../utils/queryDB'

export default {
  execute: async function (interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const channelId = interaction.options.getChannel('channel', true).id
      await changeRoomLogChannel(channelId)
      await interaction.editReply({
        content: 'Room log channel successfully set',
      })
    } catch (err: any) {
      console.error(err)
    }
  },
}

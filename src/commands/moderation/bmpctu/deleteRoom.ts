import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { removeRoomFromDb } from '../../../utils/queryDB'

export default {
  execute: async function (interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const channelId = interaction.options.getString('room', true)
      const guild = interaction.guild!
      const channel = await guild.channels.fetch(channelId).catch(() => null)
      if (!channel || !channel.id) {
        return await interaction.editReply({
          content: `failed to delete channel with id ${channelId}.`,
        })
      }
      const channelName = channel.name
      await removeRoomFromDb(channelId)
      channel?.delete()
      await interaction.editReply({ content: `${channelName} deleted.` })
    } catch (err: any) {
      console.error(err)
    }
  },
}

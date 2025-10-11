import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { addRoomToDb, getBmpctuCategory } from '../../../utils/queryDB'

export default {
  execute: async function (interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const user = interaction.options.getUser('user', true)
      const categoryId = await getBmpctuCategory()
      if (!categoryId) {
        return await interaction.editReply({
          content:
            'BMPCTU category not found. try running create-bmpctu-category.',
        })
      }
      const channel = await interaction.guild?.channels.create({
        name: `the-room-${user.displayName}`,
        type: ChannelType.GuildText,
        parent: categoryId,
      })
      if (!channel || !channel.id) {
        return await interaction.editReply({
          content: 'channel could not be created.',
        })
      }
      await addRoomToDb(user.id, channel.id).catch(() => null)
      channel.send({ content: `<@${user.id}>` })
      await interaction.editReply({
        content: `Room successfully created! <#${channel.id}>`,
      })
    } catch (err: any) {
      console.error(err)
    }
  },
}

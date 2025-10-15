import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import {
  getBmpctuUser,
  getLogAndChannelId,
  removeRoomFromDb,
} from '../../../utils/queryDB'
import { getGuild } from '../../../client'

export default {
  execute: async function (interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const channelId = interaction.options.getString('room', true)
      const guild = await getGuild()
      const channel = await guild.channels.fetch(channelId).catch(() => null)
      if (!channel || !channel.id || channel.type !== ChannelType.GuildText) {
        return await interaction.editReply({
          content: `Channel ${channelId ?? ''} is already deleted. updating DB. }.`,
        })
      }
      const channelName = channel.name
      const userId = await getBmpctuUser(channelId)
      await removeRoomFromDb(channelId)
      const member = await interaction.guild!.members.fetch(userId)
      channel.send({ content: `Closing channel, this may take 6-7 seconds.` }) // send mention
      const tBlacklist = await interaction.guild!.roles.fetch(
        '1344793211146600530',
      )
      const qBlacklist = await interaction.guild!.roles.fetch(
        '1354296037094854788',
      )
      if (tBlacklist && qBlacklist) {
        await member.roles.remove(
          [tBlacklist, qBlacklist],
          'user let out of room',
        )
      } // remove blacklist roles from user

      // change log to be green (for completed room)
      const { logId, logChannelId } = await getLogAndChannelId(
        channelId,
        userId,
      )
      const logChannel = await interaction.guild!.channels.fetch(logChannelId)
      if (logChannel?.type !== ChannelType.GuildText) {
        return interaction.editReply({
          content: `Channel ${channelId ?? ''} is already deleted. updating DB.`,
        })
      }
      const message = await logChannel.messages.fetch(logId)
      const oldEmbed = message?.embeds[0]
      if (oldEmbed) {
        const embed = EmbedBuilder.from(oldEmbed)
        embed.setColor(65280) // green
        message.edit({ embeds: [embed] })
      }

      await channel.delete()
      await interaction.editReply({ content: `${channelName} deleted.` })
    } catch (err: any) {
      console.error(err)
    }
  },
}

import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { addRoomToDb, getBmpctuCategory } from '../../../utils/queryDB'
import { createEmbedType, logStrike } from '../../../utils/logCommandUse'

export default {
  execute: async function (interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const user = interaction.options.getUser('user', true)
      let reason = interaction.options.getString('reason', false)
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
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone,
            deny: ['ViewChannel'],
          },
          {
            id: user.id,
            allow: ['ViewChannel', 'SendMessages'],
          },
          {
            id: '1357254086575128697',
            allow: ['ViewChannel', 'SendMessages'],
          },
        ],
      })
      if (!channel || !channel.id) {
        return await interaction.editReply({
          content: 'channel could not be created.',
        })
      }
      const id = await addRoomToDb(user.id, channel.id, reason ?? '')
      const member = await interaction.guild!.members.fetch(user.id)
      channel.send({ content: `<@${user.id}>` }) // send mention
      const tBlacklist = await interaction.guild!.roles.fetch(
        '1344793211146600530',
      )
      const qBlacklist = await interaction.guild!.roles.fetch(
        '1354296037094854788',
      )
      if (tBlacklist && qBlacklist) {
        await member.roles.add(
          [tBlacklist, qBlacklist],
          'room created for user',
        )
      } // add blacklist roles to user

      // log creation
      if (reason && reason?.length > 50) {
        reason = `${reason.substring(0, 50)}...`
      }
      const embedType = createEmbedType(
        `Room created for ${user.displayName}`,
        '',
        16776960, // yellow (pending room)
        [
          {
            name: 'Reason:',
            value: `${reason?.slice(0, 50) ?? 'None provided'}`,
            inline: true,
          },
        ],
        null,
        `${interaction.user.displayName}`,
      )
      await logStrike('room', embedType, id)

      await interaction.editReply({
        content: `Room successfully created! <#${channel.id}>`,
      })
    } catch (err: any) {
      console.error(err)
    }
  },
}

import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { getQueueIdFromName, getUsersInQueue } from 'utils/queryDB'
import { sendPaginatedEmbed } from '../../utils/paginatedEmbed'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const queueName = interaction.options.getString('queue-name', true)
      const queueId = await getQueueIdFromName(queueName)
      if (!queueId) {
        await interaction.reply({
          content: 'Invalid queue provided.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const queueUsers = await getUsersInQueue(queueId)

      await sendPaginatedEmbed(interaction, {
        title: `Users in Queue for ${queueName}`,
        summary: `Total: ${queueUsers.length}`,
        emptyState: `No users are currently in the queue for **${queueName}**.`,
        entries: queueUsers.map((userId: string) => `<@${userId}>`),
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to list queue users. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to list queue users. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

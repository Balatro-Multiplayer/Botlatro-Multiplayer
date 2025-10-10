import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { getQueueIdFromName, getUsersInQueue } from 'utils/queryDB'

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
      const formattedQueueUsers = queueUsers
        .map((userId: string) => {
          return `<@${userId}>`
        })
        .join('\n')

      if (queueUsers.length > 0) {
        await interaction.reply({
          content: `**Users in Queue for ${queueName}**\n${formattedQueueUsers}`,
          flags: MessageFlags.Ephemeral,
        })
      } else {
        await interaction.reply({
          content: `No users are currently in the queue for **${queueName}**.`,
          flags: MessageFlags.Ephemeral,
        })
      }
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

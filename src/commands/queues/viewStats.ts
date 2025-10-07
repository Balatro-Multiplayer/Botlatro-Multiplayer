import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { drawPlayerStatsCanvas } from '../../utils/canvasHelpers'
import { getQueueIdFromName, getStatsCanvasUserData } from '../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()

      const queueName = interaction.options.getString('queue-name', true)
      const queueId = await getQueueIdFromName(queueName)
      const playerStats = await getStatsCanvasUserData(
        interaction.user.id,
        queueId,
      )
      const statFile = await drawPlayerStatsCanvas(queueName, playerStats)

      await interaction.editReply({ files: [statFile] })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to resend message. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to resend message. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

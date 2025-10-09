import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { drawPlayerStatsCanvas } from '../../utils/canvasHelpers'
import { getQueueIdFromName, getStatsCanvasUserData } from '../../utils/queryDB'
import { setupViewStatsButtons } from '../../utils/queueHelpers'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()

      const queueName = interaction.options.getString('queue-name', true)
      const targetUser = interaction.options.getUser('user') || interaction.user
      const queueId = await getQueueIdFromName(queueName)
      const playerStats = await getStatsCanvasUserData(targetUser.id, queueId)
      const statFile = await drawPlayerStatsCanvas(queueName, playerStats)
      const viewStatsButtons = setupViewStatsButtons(queueName)

      await interaction.editReply({
        files: [statFile],
        components: [viewStatsButtons],
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to view queue stats. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to view queue stats. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

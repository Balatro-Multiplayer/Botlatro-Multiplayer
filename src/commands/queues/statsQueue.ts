import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { drawPlayerStatsCanvas } from '../../utils/canvasHelpers'
import {
  getActiveSeason,
  getQueueIdFromName,
  getStatsCanvasUserData,
} from '../../utils/queryDB'
import {
  setupViewStatsButtons,
  setUserQueueRole,
} from '../../utils/queueHelpers'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()

      const queueName = interaction.options.getString('queue-name', true)
      const targetUser = interaction.options.getUser('user') || interaction.user
      const byDate =
        interaction.options.getString('by-date') === 'yes' ? true : false
      const showDots =
        interaction.options.getString('dots') === 'yes' ? true : false
      const queueId = await getQueueIdFromName(queueName)
      const activeSeason = await getActiveSeason()
      const season = interaction.options.getInteger('season') ?? activeSeason
      const playerStats = await getStatsCanvasUserData(
        targetUser.id,
        queueId,
        season,
      )
      const statFile = await drawPlayerStatsCanvas(
        queueName,
        playerStats,
        byDate,
        season,
        showDots,
      )
      const viewStatsButtons = setupViewStatsButtons(queueName)

      await interaction.editReply({
        files: [statFile],
        components: [viewStatsButtons],
      })

      // Update queue role, just to be sure it's correct when they check
      await setUserQueueRole(queueId, targetUser.id)
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

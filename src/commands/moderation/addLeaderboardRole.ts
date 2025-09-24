import { COMMAND_HANDLERS } from 'command-handlers'
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { getQueueIdFromName } from 'utils/queryDB'

export default {
  execute: async function (interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const queueName = interaction.options.getString('queue-name', true)
      const queueId = await getQueueIdFromName(queueName)
      const role = interaction.options.getRole('role', true)
      const leaderboardMin = interaction.options.getNumber(
        'leaderboard-min',
        true,
      )
      const leaderboardMax = interaction.options.getNumber(
        'leaderboard-max',
        true,
      )

      const queueRoleCheck =
        await COMMAND_HANDLERS.MODERATION.ADD_LEADERBOARD_ROLE(
          queueId,
          role.id,
          leaderboardMin,
          leaderboardMax,
        )

      if (queueRoleCheck) {
        await interaction.editReply({
          content: `Successfully added ${role.name} as a leaderboard role to ${queueName}.`,
        })
      } else {
        await interaction.editReply({
          content: `Failed to added ${role.name} as a leaderboard role.`,
        })
      }
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to add leaderboard role. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to add leaderboard role. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

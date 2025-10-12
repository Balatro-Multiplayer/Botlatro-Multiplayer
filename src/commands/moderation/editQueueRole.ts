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
      const mmrThreshold = interaction.options.getNumber('mmr-threshold', false)
      const emote = interaction.options.getString('emote', false)

      // Check if at least one optional field is provided
      if (mmrThreshold === null && emote === null) {
        await interaction.editReply({
          content: 'You must provide at least one field to update (mmr-threshold or emote).',
        })
        return
      }

      const queueRoleUpdate = await COMMAND_HANDLERS.MODERATION.EDIT_QUEUE_ROLE(
        queueId,
        role.id,
        mmrThreshold !== null ? mmrThreshold : undefined,
        emote !== null ? emote : undefined,
      )

      if (queueRoleUpdate) {
        await interaction.editReply({
          content: `Successfully updated ${role.name} in ${queueName}.`,
        })
      } else {
        await interaction.editReply({
          content: `Failed to update ${role.name}. Make sure this role exists in the queue.`,
        })
      }
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to edit queue role. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to edit queue role. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

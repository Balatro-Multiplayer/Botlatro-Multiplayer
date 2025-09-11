import {
  ChatInputCommandInteraction,
  MessageFlags,
  AutocompleteInteraction,
} from 'discord.js'
import { COMMAND_HANDLERS } from '../../command-handlers'
import { getQueueIdFromName, getQueueNames } from 'utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction, lock: boolean = true) {
    try {
      const queueName = interaction.options.getString('queue-name', true)
      const queueId = await getQueueIdFromName(queueName);
      if (!queueId) {
        await interaction.reply({
          content: 'Invalid queue provided.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      let queueLock = false;

      if (lock) {
        queueLock = await COMMAND_HANDLERS.MODERATION.LOCK_QUEUE(queueId)
      } else {
        queueLock = await COMMAND_HANDLERS.MODERATION.UNLOCK_QUEUE(queueId);
      }

      if (queueLock) {
        interaction.reply({
          content: `Successfully ${lock ? 'locked' : 'unlocked'} ${queueName}.`,
        })
      } else {
        interaction.reply({ content: `Failed to ${lock ? 'lock' : 'unlock'} ${queueName}.` })
      }
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to ${lock ? 'lock' : 'unlock'} queue. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to ${lock ? 'lock' : 'unlock'} queue. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },

}

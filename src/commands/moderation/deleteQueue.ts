import {
  ChatInputCommandInteraction,
  MessageFlags,
  AutocompleteInteraction,
} from 'discord.js'
import { pool } from '../../db'
import { getQueueNames } from '../../utils/queryDB'
import { updateQueueMessage } from '../../utils/queueHelpers'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // delete the queue from the database
      let queueName = interaction.options.getString('queue-name')
      const res = await pool.query(
        'DELETE FROM queues WHERE queue_name = $1 RETURNING queue_name',
        [queueName],
      )
      if (res.rowCount === 0) {
        return interaction.reply(`Failed to delete queue ${queueName}.`)
      }

      await updateQueueMessage()
      return interaction.reply({
        content: `Successfully deleted ${queueName} from the queues list.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to delete queue. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to delete queue. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const currentValue = interaction.options.getFocused()
    const queueNames = await getQueueNames()
    const filteredQueueNames = queueNames.filter((name) =>
      name.toLowerCase().includes(currentValue.toLowerCase()),
    )
    await interaction.respond(
      filteredQueueNames.map((name) => ({ name, value: name })).slice(0, 25),
    )
  },
}

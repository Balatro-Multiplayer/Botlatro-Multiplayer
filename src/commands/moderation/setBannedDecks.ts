import {
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { COMMAND_HANDLERS } from '../../command-handlers'
import { getQueueIdFromName } from 'utils/queryDB'
import { setupDeckSelect } from 'utils/matchHelpers'

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
            return;
        }

        const deckSelectRow = await setupDeckSelect(
            'queue-ban-decks',
            'Select decks to ban for this queue.',
            1,
            25,
            true,
        )

        interaction.reply({
            content: `Select decks to ban for ${queueName}`,
            components: [deckSelectRow],
            flags: MessageFlags.Ephemeral
        })
    } catch (err: any) {
        console.error(err)
        const errorMsg = err.detail || err.message || 'Unknown'
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: `Failed to set banned decks in queue. Reason: ${errorMsg}`,
            })
        } else {
            await interaction.reply({
                content: `Failed to set banned decks in queue. Reason: ${errorMsg}`,
                flags: MessageFlags.Ephemeral,
            })
        }
    }
  },

}

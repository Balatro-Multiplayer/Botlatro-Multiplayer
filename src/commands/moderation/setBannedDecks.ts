import {
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { getDeckList, getDecksInQueue, getQueueIdFromName } from 'utils/queryDB'
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
        const deckList = await getDeckList(true);
        
        const deckSelectRow = await setupDeckSelect(
            `queue-ban-decks-${queueId}`,
            `Select decks to ban for ${queueName}.`,
            1,
            deckList.length,
            true,
        )

        await interaction.reply({
            content: `Select decks to ban for ${queueName} with the select menu below.`,
            components: [deckSelectRow],
            flags: MessageFlags.Ephemeral
        });

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

import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { getRandomDeck } from '../../utils/matchHelpers'
import {
  getMatchIdFromChannel,
  getQueueIdFromMatch,
  getDecksInQueue,
} from '../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Check if we're in a match channel
      const matchId = await getMatchIdFromChannel(interaction.channelId)

      if (matchId) {
        // In a match channel - only pick from allowed decks in this queue
        const queueId = await getQueueIdFromMatch(matchId)
        const allowedDecks = await getDecksInQueue(queueId)

        if (allowedDecks.length === 0) {
          await interaction.reply({
            content: 'No decks available in this queue.',
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        const randomDeck =
          allowedDecks[Math.floor(Math.random() * allowedDecks.length)]
        const deckStr = `${randomDeck.deck_emote} ${randomDeck.deck_name}`
        await interaction.reply({ content: deckStr })
      } else {
        // Not in a match channel - use normal logic
        const deckChoice = await getRandomDeck(true)
        const deckStr = `${deckChoice.deck_emote} ${deckChoice.deck_name}`
        await interaction.reply({ content: deckStr })
      }
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to send message. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to send message. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

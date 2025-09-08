import {
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { getRandomDeck } from '../../utils/matchHelpers'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    const customDecks = interaction.options.getString('custom-decks') || null
    let customDecksBoolean = false
    if (customDecks == 'yes') customDecksBoolean = true
    try {
      const deckChoice = getRandomDeck(customDecksBoolean)
      const deckStr = `${deckChoice.deck_emote} ${deckChoice.deck_name}`
      interaction.reply({ content: deckStr })
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

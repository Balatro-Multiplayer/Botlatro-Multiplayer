import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { pool } from '../../db'
import { getDeckList } from '../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    const deckName = interaction.options.getString('deck-name', true)
    const newDeckName = interaction.options.getString('new-deck-name', false)
    const deckEmote = interaction.options.getString('deck-emote', false)
    const deckDesc = interaction.options.getString('deck-desc', false)
    const emoteName = interaction.options.getString('emote-name', false)

    try {
      const result = await pool.query(
        `
        UPDATE decks
        SET
          deck_name = COALESCE($2, deck_name),
          deck_emote = COALESCE($3, deck_emote),
          deck_desc = COALESCE($4, deck_desc),
          emote_name = COALESCE($5, emote_name)
        WHERE deck_name = $1
        RETURNING deck_name
        `,
        [deckName, newDeckName, deckEmote, deckDesc, emoteName],
      )

      if (result.rowCount === 0) {
        await interaction.reply({
          content: `No deck found with the name "${deckName}".`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      await interaction.reply({
        content: `Successfully updated deck **${deckName}**.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown error'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to update deck. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to update deck. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const currentValue = interaction.options.getFocused()
    const deckList = await getDeckList()
    const filtered = deckList
      .filter((deck) =>
        deck.deck_name.toLowerCase().includes(currentValue.toLowerCase()),
      )
      .slice(0, 25)
    await interaction.respond(
      filtered.map((deck) => ({ name: deck.deck_name, value: deck.deck_name })),
    )
  },
}

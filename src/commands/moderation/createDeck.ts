import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../db'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    const deckName = interaction.options.getString('deck-name', true)
    const deckEmote = interaction.options.getString('deck-emote', true)
    const deckDesc = interaction.options.getString('deck-desc', true)

    try {
      const existing = await pool.query(
        `SELECT id FROM decks WHERE deck_name = $1`,
        [deckName],
      )

      if (existing.rowCount && existing.rowCount > 0) {
        await interaction.reply({
          content: `A deck named **${deckName}** already exists.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      await pool.query(
        `INSERT INTO decks (deck_name, deck_emote, deck_desc, custom) VALUES ($1, $2, $3, true)`,
        [deckName, deckEmote, deckDesc],
      )

      await interaction.reply({
        content: `Successfully created deck **${deckName}** ${deckEmote}.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown error'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to create deck. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to create deck. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

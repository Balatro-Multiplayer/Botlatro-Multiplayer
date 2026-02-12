import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { pool } from '../../db'

export default {
  data: new SlashCommandBuilder()
    .setName('change-deck-probabilities')
    .setDescription('Change the multiplier for a queue deck')

    .addStringOption((option) =>
      option
        .setName('queue')
        .setDescription('Queue')
        .setRequired(true)
        .setAutocomplete(true),
    )

    .addStringOption((option) =>
      option
        .setName('deck')
        .setDescription('Deck')
        .setRequired(true)
        .setAutocomplete(true),
    )

    .addNumberOption((option) =>
      option
        .setName('multiplier')
        .setDescription('Probability multiplier')
        .setRequired(true)
        .setMinValue(0),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const queueId = Number(interaction.options.getString('queue'))
    const deckId = Number(interaction.options.getString('deck'))
    const multiplier = interaction.options.getNumber('multiplier')

    const { rows } = await pool.query(
      `SELECT deck_name FROM decks WHERE id = $1`,
      [deckId],
    )

    const deckName = rows[0]?.deck_name

    await pool.query(
      `
        INSERT INTO deck_mults (queue_id, deck_id, multiplier, deck_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (queue_id, deck_id)
          DO UPDATE SET multiplier = EXCLUDED.multiplier
      `,
      [queueId, deckId, multiplier, deckName],
    )

    await interaction.editReply(`Deck multiplier updated.`)
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true)

    try {
      if (focused.name === 'queue') {
        const result = await pool.query(
          `
            SELECT id, queue_name
            FROM queues
            WHERE queue_name ILIKE $1
            ORDER BY queue_name
            LIMIT 25
          `,
          [`%${focused.value}%`],
        )

        await interaction.respond(
          result.rows.map((row) => ({
            name: row.queue_name,
            value: String(row.id),
          })),
        )
      }

      if (focused.name === 'deck') {
        const result = await pool.query(
          `
            SELECT id, deck_name
            FROM decks
            WHERE deck_name ILIKE $1
            ORDER BY deck_name
            LIMIT 25
          `,
          [`%${focused.value}%`],
        )

        await interaction.respond(
          result.rows.map((row) => ({
            name: row.deck_name,
            value: String(row.id),
          })),
        )
      }
    } catch (err) {
      console.error(err)
      if (!interaction.responded) {
        await interaction.respond([])
      }
    }
  },
}

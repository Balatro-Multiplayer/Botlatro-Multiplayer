import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { pool } from '../../db'

export default {
  data: new SlashCommandBuilder()
    .setName('change-stake-probabilities')
    .setDescription('Change the multiplier for a queue stake')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addStringOption((option) =>
      option
        .setName('queue')
        .setDescription('Queue')
        .setRequired(true)
        .setAutocomplete(true),
    )

    .addStringOption((option) =>
      option
        .setName('stake')
        .setDescription('Stake')
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
    const stakeId = Number(interaction.options.getString('stake'))
    const multiplier = interaction.options.getNumber('multiplier')

    const { rows } = await pool.query(
      `SELECT stake_name FROM stakes WHERE id = $1`,
      [stakeId],
    )

    const stakeName = rows[0]?.stake_name

    await pool.query(
      `
        INSERT INTO stake_mults (queue_id, stake_id, multiplier, stake_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (queue_id, stake_id)
          DO UPDATE SET multiplier = EXCLUDED.multiplier
      `,
      [queueId, stakeId, multiplier, stakeName],
    )

    await interaction.editReply(`Stake multiplier updated.`)
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

      if (focused.name === 'stake') {
        const result = await pool.query(
          `
          SELECT id, stake_name
          FROM stakes
          WHERE stake_name ILIKE $1
          ORDER BY stake_name
          LIMIT 25
          `,
          [`%${focused.value}%`],
        )

        await interaction.respond(
          result.rows.map((row) => ({
            name: row.stake_name,
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

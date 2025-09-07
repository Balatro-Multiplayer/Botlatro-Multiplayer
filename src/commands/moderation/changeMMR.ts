import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  AutocompleteInteraction,
} from 'discord.js'
import { closeMatch, getQueueNames, updatePlayerElo } from '../../utils/queryDB'
import { pool } from '../../db'

module.exports = {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const user = interaction.options.getUser('user', true)
      const queueName = interaction.options.getString('queue-name', true)
      const newElo = interaction.options.getNumber('new-elo', true)
      const queueRes = await pool.query(
        `SELECT id FROM queues WHERE queue_name = $1`,
        [queueName],
      )

      const client = interaction.client
      const guild =
        client.guilds.cache.get(process.env.GUILD_ID!) ??
        (await client.guilds.fetch(process.env.GUILD_ID!))

      const member = await guild.members.fetch(user.id)

      if (queueRes && queueRes.rowCount != 0) {
        await updatePlayerElo(queueRes.rows[0].id, user.id, newElo)
        interaction.reply({
          content: `Set **${member.displayName}**'s MMR in **${queueName}** to **${newElo}**.`,
          flags: MessageFlags.Ephemeral,
        })
      } else {
        return interaction.reply('Failed to change MMR.')
      }
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to cancel match. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to cancel match. Reason: ${errorMsg}`,
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

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  AutocompleteInteraction,
} from 'discord.js'
import {
  getUsersInMatch,
  getMatchIdFromChannel,
  getUserTeam,
} from '../../utils/queryDB'
import { pool } from '../../db'
import { endMatch } from '../../utils/matchHelpers'

export default {
  data: new SlashCommandBuilder()
    .setName('give-win')
    .setDescription('[ADMIN] Manually choose a winner for an in-progress match')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((option) =>
      option
        .setName('match-id')
        .setDescription(
          'The match ID to assign a win for (defaults to current channel)',
        )
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('user')
        .setDescription('The user to give the win to')
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const matchId = await getMatchIdFromChannel(interaction.channelId)
      const userId = interaction.options.getString('user', true)
      if (!matchId) {
        await interaction.reply({
          content: 'No active match found in this channel.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }
      const winningTeam = await getUserTeam(userId, matchId)
      await pool.query('UPDATE matches SET winning_team = $1 WHERE id = $2', [
        winningTeam,
        matchId,
      ])
      await interaction.reply(
        `Assigned win to <@${interaction.options.getString('user', true)}>.`,
      )
      await endMatch(matchId)
    } catch (err: any) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to assign win. Reason: ${err}`,
        })
      } else {
        interaction.reply({
          content: `Failed to assign win. Reason: ${err}`,
          flags: MessageFlags.Ephemeral,
        })
      }
      console.error(err)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const currentValue = interaction.options.getFocused(true)
    const matchId = interaction.options.getInteger('match-id')

    if (currentValue.name === 'user') {
      const input = currentValue.value

      if (!matchId) {
        await interaction.respond([])
        return
      }
      const usersIdInMatch = await getUsersInMatch(matchId)
      const users = await Promise.all(
        usersIdInMatch.map(async (userId) => {
          const user = await interaction.client.users.fetch(userId)
          return {
            name: user.username,
            value: userId,
          }
        }),
      )
      const filtered = users.filter((user) =>
        user.name.toLowerCase().includes(input.toLowerCase()),
      )
      await interaction.respond(filtered.slice(0, 25))
    } else if (currentValue.name === 'match-id') {
      const input = currentValue.value
      const matches = await pool.query(
        'SELECT id FROM matches WHERE open = true',
      )
      if (!matches.rows || matches.rows.length === 0) {
        await interaction.respond([])
        return
      }
      const matchIds = matches.rows.map((match: any) => ({
        name: (interaction.channelId = match.id.toString())
          ? `${match.id.toString()} (current channel)`
          : match.id.toString(),
        value: match.id.toString(),
      }))
      const filtered = matchIds.filter((match) => match.name.includes(input))
      await interaction.respond(filtered.slice(0, 25))
    }
  },
}

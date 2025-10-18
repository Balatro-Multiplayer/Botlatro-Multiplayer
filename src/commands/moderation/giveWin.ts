import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { getUsersInMatch, getUserTeam } from '../../utils/queryDB'
import { endMatch } from '../../utils/matchHelpers'
import { getMatchesForAutocomplete } from '../../utils/Autocompletions'
import { pool } from '../../db'

export default {
  data: new SlashCommandBuilder()
    .setName('give-win')
    .setDescription(
      '[HELPER] Manually choose a winner for an in-progress match',
    )
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      const matchId = interaction.options.getInteger('match-id')
      const userId = interaction.options.getString('user', true)
      if (!matchId) {
        await interaction.editReply({
          content: 'No match found.',
        })
        return
      }

      const winningTeam = await getUserTeam(userId, matchId)
      await pool.query('UPDATE matches SET winning_team = $1 WHERE id = $2', [
        winningTeam,
        matchId,
      ])

      // End match
      await endMatch(matchId, false)

      await interaction.editReply({
        content: `Successfully assigned win to <@${userId}> (Team ${winningTeam}) for Match #${matchId}.`,
      })
    } catch (err: any) {
      console.error('Error assigning win:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      await interaction.editReply({
        content: `Failed to assign win.\nError: ${errorMessage}`,
      })
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
      const input = currentValue.value ?? ''
      const matches = await getMatchesForAutocomplete(input)

      if (!matches || matches.length === 0) {
        await interaction.respond([])
        return
      }

      const matchIds = matches.map((match) => ({
        name: match.id.toString(),
        value: match.id.toString(),
      }))

      await interaction.respond(matchIds)
    }
  },
}

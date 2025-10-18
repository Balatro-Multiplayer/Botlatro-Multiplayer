import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js'
import { COMMAND_HANDLERS } from '../../command-handlers'
import { getQueueIdFromMatch, getQueueSettings } from '../../utils/queryDB'
import { getMatchesForAutocomplete } from '../../utils/Autocompletions'

export default {
  data: new SlashCommandBuilder()
    .setName('cancel-match')
    .setDescription('Cancel a specific match')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('match-id')
        .setDescription('The match ID to cancel')
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const matchIdStr = interaction.options.getString('match-id', true)
      const matchId = parseInt(matchIdStr)

      if (isNaN(matchId)) {
        await interaction.reply({
          content: 'Invalid match ID provided.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const matchCancelCheck =
        await COMMAND_HANDLERS.MODERATION.CANCEL_MATCH(matchId)

      if (matchCancelCheck) {
        await interaction
          .reply({
            content: `Successfully cancelled match ${matchId}`,
          })
          .catch(() => console.log('Failed to reply'))
      } else {
        await interaction
          .reply({
            content: `Failed to cancel match ${matchId}.`,
          })
          .catch(() => console.log('Failed to reply'))
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
    try {
      const focusedValue = interaction.options.getFocused()
      const matches = await getMatchesForAutocomplete(focusedValue)

      const choices = await Promise.all(
        matches.map(async (match) => {
          const queueId = await getQueueIdFromMatch(match.id)
          const queueSettings = await getQueueSettings(queueId, ['queue_name'])
          return {
            name: `Match ${match.id} - ${queueSettings.queue_name}`,
            value: match.id.toString(),
          }
        }),
      )

      await interaction.respond(choices)
    } catch (err) {
      console.error('Error in cancel-match autocomplete:', err)
      await interaction.respond([])
    }
  },
}

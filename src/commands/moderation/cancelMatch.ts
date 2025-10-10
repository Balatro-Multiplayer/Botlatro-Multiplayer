import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js'
import { COMMAND_HANDLERS } from '../../command-handlers'
import {
  getActiveMatches,
  getQueueIdFromMatch,
  getQueueSettings,
} from '../../utils/queryDB'

export default {
  data: new SlashCommandBuilder()
    .setName('cancel-match')
    .setDescription('Cancel a specific match')
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
        await interaction.reply({
          content: `Successfully cancelled match ${matchId}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to cancel match ${matchId}.`,
        })
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
      const focusedValue = interaction.options.getFocused().toLowerCase()
      const activeMatches = await getActiveMatches()

      const choices = await Promise.all(
        activeMatches.map(async (match) => {
          const queueId = await getQueueIdFromMatch(match.id)
          const queueSettings = await getQueueSettings(queueId, ['queue_name'])
          return {
            name: `Match ${match.id} - ${queueSettings.queue_name}`,
            value: match.id.toString(),
          }
        }),
      )

      const filtered = choices.filter((choice) =>
        choice.name.toLowerCase().includes(focusedValue),
      )

      await interaction.respond(filtered.slice(0, 25))
    } catch (err) {
      console.error('Error in cancel-match autocomplete:', err)
      await interaction.respond([])
    }
  },
}

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  AutocompleteInteraction,
} from 'discord.js'

import queue from './queue'
import editQueue from '../moderation/editQueue'

export default {
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit things')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('queue')
        .setDescription('Edit information for a queue')
        // required
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('Name of the queue to edit')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(255),
        )
        .addStringOption((option) =>
          option
            .setName('queue-desc')
            .setDescription('A description for the queue')
            .setRequired(false)
            .setMaxLength(100),
        )
        .addIntegerOption((option) =>
          option
            .setName('default-elo')
            .setDescription('Default ELO for new players')
            .setRequired(false)
            .setMinValue(0),
        )
        // optional
        .addIntegerOption((option) =>
          option
            .setName('members-per-team')
            .setDescription('Number of members per team')
            .setRequired(false)
            .setMinValue(1),
        )
        .addIntegerOption((option) =>
          option
            .setName('number-of-teams')
            .setDescription('Number of teams per game')
            .setRequired(false)
            .setMinValue(2),
        )
        .addIntegerOption((option) =>
          option
            .setName('queue-elo-search-start')
            .setDescription('Starting ELO distance for searching players')
            .setRequired(false)
            .setMinValue(0),
        )
        .addIntegerOption((option) =>
          option
            .setName('queue-elo-search-increment')
            .setDescription('ELO distance increment for searching players')
            .setRequired(false)
            .setMinValue(0),
        )
        .addIntegerOption((option) =>
          option
            .setName('queue-elo-search-speed')
            .setDescription('Speed of ELO increment (in seconds)')
            .setRequired(false)
            .setMinValue(1),
        )
        .addIntegerOption((option) =>
          option
            .setName('max-party-elo-difference')
            .setDescription('Maximum Party ELO Difference')
            .setRequired(false)
            .setMinValue(1),
        )
        .addBooleanOption((option) =>
          option
            .setName('allow-best-of')
            .setDescription('Allow best of 3 or 5 matches in queues.')
            .setRequired(false),
        )
        .addNumberOption((option) =>
          option
            .setName('deck-ban-amount')
            .setDescription('Amount of decks for the first player to ban')
            .setRequired(false)
            .setMinValue(1),
        )
        .addNumberOption((option) =>
          option
            .setName('deck-ban-pick-amount')
            .setDescription('Amount of decks for the second player to pick')
            .setRequired(false)
            .setMinValue(2),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'queue') {
      await editQueue.execute(interaction)
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    await queue.autocomplete(interaction)
  },
}

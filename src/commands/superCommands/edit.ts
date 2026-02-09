import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'

import queue from './queue'
import editQueue from '../moderation/editQueue'
import editQueueRole from '../moderation/editQueueRole'

export default {
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit things')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('queue')
        .setDescription('[ADMIN] Edit information for a queue')
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
        )
        .addRoleOption((option) =>
          option
            .setName('role-lock')
            .setDescription('The role to lock the queue to')
            .setRequired(false),
        )
        .addNumberOption((option) =>
          option
            .setName('veto-mmr-threshold')
            .setDescription(
              'The amount of MMR a user has at minimum to not be able to veto',
            )
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('color')
            .setDescription(
              'Hex color for the queue results embed (e.g., #FFD700)',
            )
            .setRequired(false)
            .setMinLength(7)
            .setMaxLength(7),
        )
        .addIntegerOption((option) =>
          option
            .setName('instaqueue-min')
            .setDescription(
              'Minimum MMR for instant queue matching (players in range match immediately)',
            )
            .setRequired(false)
            .setMinValue(0),
        )
        .addIntegerOption((option) =>
          option
            .setName('instaqueue-max')
            .setDescription(
              'Maximum MMR for instant queue matching (players in range match immediately)',
            )
            .setRequired(false)
            .setMinValue(0),
        )
        .addBooleanOption((option) =>
          option
            .setName('use-tuple-bans')
            .setDescription('Whether or not this queue should use tuple bans.')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('queue-role')
        .setDescription('[ADMIN] Edit a queue rank role in a specific queue')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue containing the role')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The queue rank role to edit')
            .setRequired(true),
        )
        .addNumberOption((option) =>
          option
            .setName('mmr-threshold')
            .setDescription('The new minimum MMR to have this role')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('emote')
            .setDescription('The new emote for this role')
            .setRequired(false),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'queue') {
      await editQueue.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'queue-role') {
      await editQueueRole.execute(interaction)
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    await queue.autocomplete(interaction)
  },
}
// this supercommand should only be usable by mod+

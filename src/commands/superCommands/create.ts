import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'

import newQueue from '../moderation/newQueue'
import addQueueRole from 'commands/moderation/addQueueRole'
import queue from './queue'
import addLeaderboardRole from '../moderation/addLeaderboardRole'
import createRoom from '../moderation/bmpctu/createRoom'

export default {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create things')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('queue')
        .setDescription('[ADMIN] Create a new queue')
        // required
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('Name of the queue')
            .setRequired(true)
            .setMaxLength(255),
        )
        .addStringOption((option) =>
          option
            .setName('queue-desc')
            .setDescription('A description for the queue')
            .setRequired(true)
            .setMaxLength(100),
        )
        .addIntegerOption((option) =>
          option
            .setName('default-elo')
            .setDescription('Default ELO for new players')
            .setRequired(true)
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
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('queue-leaderboard-role')
        .setDescription(
          '[ADMIN] Create a queue leaderboard role for use in a specific queue.',
        )
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription(
              'The queue you would like to add the queue leaderboard role to',
            )
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The queue leaderboard role in discord')
            .setRequired(true),
        )
        .addNumberOption((option) =>
          option
            .setName('leaderboard-min')
            .setDescription(
              'The minimum leaderboard rank to gain to have this role',
            )
            .setRequired(true),
        )
        .addNumberOption((option) =>
          option
            .setName('leaderboard-max')
            .setDescription(
              'The maximum leaderboard rank a user can have to have this role',
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('emote')
            .setDescription('The emote that should be attached to this role.')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('queue-role')
        .setDescription(
          '[ADMIN] Create a queue rank role for use in a specific queue.',
        )
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription(
              'The queue you would like to add the queue rank role to',
            )
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The queue rank role in discord')
            .setRequired(true),
        )
        .addNumberOption((option) =>
          option
            .setName('mmr-threshold')
            .setDescription('The minimum MMR to gain to have this role')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('room')
        .setDescription('[BMPCTU] Create a BMPCTU room')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User to create room for')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Reason to add this user to a room')
            .setRequired(false),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'queue') {
      await newQueue.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'queue-role') {
      await addQueueRole.execute(interaction)
    } else if (
      interaction.options.getSubcommand() === 'queue-leaderboard-role'
    ) {
      await addLeaderboardRole.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'room') {
      await createRoom.execute(interaction)
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    await queue.autocomplete(interaction)
  },
}
// this supercommand should only be usable by bmpctu+

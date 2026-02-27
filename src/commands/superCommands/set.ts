import {
  AutocompleteInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'

import changeMMR from '../moderation/changeMMR'
import queue from './queue'
import setBannedDecks from 'commands/moderation/setBannedDecks'
import setDecay from '../moderation/setDecay'
import setBmpctuCategory from '../moderation/bmpctu/setBmpctuCategory'
import setRoomLogChannel from '../moderation/bmpctu/setRoomLogChannel'
import setBountyHelperRole from '../moderation/bounty/setBountyHelperRole'

export default {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('sets things to a certain value')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('mmr')
        .setDescription('[ADMIN] Set a users MMR in a specific queue')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user whose MMR you want to change')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue that you are changing the mmr in')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addNumberOption((option) =>
          option
            .setName('new-elo')
            .setDescription('The new elo to set the user to')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('banned-decks')
        .setDescription('[ADMIN] Set banned decks for a specified queue.')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The user whose MMR you want to change')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('decay')
        .setDescription('[ADMIN] Settings for MMR decay')
        .addNumberOption((option) =>
          option
            .setName('decay-threshold')
            .setDescription('The MMR at which decay begins')
            .setRequired(true),
        )
        .addNumberOption((option) =>
          option
            .setName('decay-amount')
            .setDescription('The amount of MMR lost per decay tick')
            .setRequired(true),
        )
        .addNumberOption((option) =>
          option
            .setName('decay-interval')
            .setDescription('The rate at which decay ticks happen, in hours')
            .setRequired(true),
        )
        .addNumberOption((option) =>
          option
            .setName('grace-period')
            .setDescription('The grace before decay starts ticking, in hours')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('bmpctu-category')
        .setDescription('[BMPCTU] Set the BMPCTU category')
        .addChannelOption(
          (option) =>
            option
              .setName('category')
              .setDescription('Choose a category')
              .setRequired(true)
              .addChannelTypes(4), // cat
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('room-log')
        .setDescription('[BMPCTU] Set the room log channel')
        .addChannelOption(
          (option) =>
            option
              .setName('channel')
              .setDescription('Choose a channel')
              .setRequired(true)
              .addChannelTypes(0), // txt
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('bounty-helper-role')
        .setDescription('[ADMIN] Set the bounty helper role')
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The role to set as bounty helper')
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'mmr') {
      await changeMMR.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'banned-decks') {
      await setBannedDecks.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'decay') {
      await setDecay.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'bmpctu-category') {
      await setBmpctuCategory.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'room-log') {
      await setRoomLogChannel.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'bounty-helper-role') {
      await setBountyHelperRole.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommand = interaction.options.getSubcommand()
    if (subcommand === 'mmr') {
      await changeMMR.autocomplete(interaction)
    } else if (subcommand === 'banned-decks') {
      await queue.autocomplete(interaction)
    }
  },
}
// this supercommand should only be usable by bmpctu+

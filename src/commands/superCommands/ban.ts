import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import queue from './queue'
import banUser from '../moderation/playerModeration/banUser'

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Manage user bans in a queue. (Helper+ Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a queue ban to a user.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to ban from the queue')
            .setRequired(true),
        )
        .addNumberOption((option) =>
          option
            .setName('length')
            .setDescription('The length of the ban in days')
            .setRequired(true),
        )
        // todo: add this back in when we can be arsed
        // .addStringOption((option) =>
        //   option
        //     .setName('queue')
        //     .setDescription(
        //       'The queue you would like to ban the user from (blank = all queues)',
        //     )
        //     .setRequired(true)
        //     .setAutocomplete(false),
        // )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('The reason to ban this user from the queue')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a queue ban from a user.')
        .addStringOption((option) =>
          option
            .setName('user')
            .setDescription('The user to lift the ban from')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('The reason to unban this user from the queue')
            .setRequired(false),
        ),
    ),

  // todo: add autocomplete and execution for subcommand 'remove'
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'add') {
      await banUser.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    if (interaction.options.getSubcommand() === 'add') {
      await queue.autocomplete(interaction)
    }
  },
}
// this supercommand should only be usable by helper+

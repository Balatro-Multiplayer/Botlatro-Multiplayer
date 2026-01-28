import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js'
import queue from './queue'
import banUser from '../moderation/playerModeration/banUser'

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Manage user bans in a queue. (Helper+ Only)')

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
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'add') {
      await banUser.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await queue.autocomplete(interaction)
  },
}
// this supercommand should only be usable by helper+

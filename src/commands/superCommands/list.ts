import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  AutocompleteInteraction,
} from 'discord.js'

import listAllOpenParties from '../party/listAllOpenParties'
import ListUsersInSpecificParty from '../party/listUsersInSpecificParty'
import queue from './queue'
import listQueueRoles from 'commands/moderation/listQueueRoles'
import listQueueUsers from '../moderation/listQueueUsers'

export default {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List things')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName('parties').setDescription('[ADMIN] Lists all parties'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('users-in-party')
        .setDescription('[ADMIN] Lists users in the specified party')
        .addStringOption((option) =>
          option
            .setName('party-to-check')
            .setDescription('[ADMIN] lists users in the specified party')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('queue-roles')
        .setDescription('[ADMIN] Lists queue roles in a queue.')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue to check for roles in.')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('queue-users')
        .setDescription('[ADMIN] Lists all users actively in a queue.')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue to check for users in.')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'parties') {
      await listAllOpenParties.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'users-in-party') {
      await ListUsersInSpecificParty.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'queue-roles') {
      await listQueueRoles.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'queue-users') {
      await listQueueUsers.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'users-in-party') {
      await ListUsersInSpecificParty.autocomplete(interaction)
    } else if (subcommand === 'queue-roles' || subcommand === 'queue-users') {
      await queue.autocomplete(interaction)
    }
  },
}

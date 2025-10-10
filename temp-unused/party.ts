import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js'

import partyCheckUsers from '../src/commands/party/partyCheckUsers'
import partyCreate from '../src/commands/party/partyCreate'
import partyDisband from '../src/commands/party/partyDisband'
import partyInvite from '../src/commands/party/partyInvite'
import partyKick from '../src/commands/party/partyKick'
import partyLeave from '../src/commands/party/partyLeave'

export default {
  data: new SlashCommandBuilder()
    .setName('party')
    .setDescription('party commands')

    .addSubcommand((sub) =>
      sub.setName('list-users').setDescription('List all users in your party'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a party')
        .addStringOption((option) =>
          option
            .setName('party-name')
            .setDescription('Name your party')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('disband').setDescription('Disband your current party'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('invite')
        .setDescription('Invite a user to your party')
        .addUserOption((option) =>
          option
            .setName('member')
            .setDescription('The member you would like to invite to your party')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('join')
        .setDescription('Join a party that you have a pending invite to'),
    )
    .addSubcommand((sub) =>
      sub.setName('leave').setDescription('Leave your current party'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('promote')
        .setDescription('Promote a user in your party to be the new leader'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Remove a user from your party')
        .addStringOption((option) =>
          option
            .setName('user')
            .setDescription('The user you would like to remove from your party')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'list-users') {
      await partyCheckUsers.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'create') {
      await partyCreate.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'disband') {
      await partyDisband.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'invite') {
      await partyInvite.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'join') {
      // await partyJoin.execute(interaction);
    } else if (interaction.options.getSubcommand() === 'leave') {
      await partyLeave.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'promote') {
      // await partyPromote.execute(interaction);
    } else if (interaction.options.getSubcommand() === 'kick') {
      await partyKick.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'kick') {
      const partyKick = require('../src/commands/party/partyKick').default
      await partyKick.autocomplete(interaction)
    }
  },
}

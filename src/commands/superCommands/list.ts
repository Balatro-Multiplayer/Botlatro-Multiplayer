import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle, AutocompleteInteraction  } from 'discord.js';
import { pool } from '../../db';
import { partyUtils } from '../../utils/queryDB';

const listAllOpenParties = require('../party/listAllOpenParties');
const ListUsersInSpecificParty = require('../party/listUsersInSpecificParty');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List things')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('parties').setDescription('[ADMIN] Lists all parties'))
    .addSubcommand(sub => sub.setName('users-in-party').setDescription('[ADMIN] Lists users in the specified party')
        .addStringOption(option => option
            .setName('party-to-check')
            .setDescription('[ADMIN] lists users in the specified party')
            .setAutocomplete(true)
            .setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {

    if (interaction.options.getSubcommand() === 'parties') {
    await listAllOpenParties.execute(interaction);
    } else if (interaction.options.getSubcommand() === 'users-in-party') {
    await ListUsersInSpecificParty.execute(interaction);
    }

  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'users-in-party') {
    await ListUsersInSpecificParty.autocomplete(interaction);
    }
  }
  
};
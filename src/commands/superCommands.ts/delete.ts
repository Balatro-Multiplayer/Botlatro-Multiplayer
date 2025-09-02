import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle, AutocompleteInteraction  } from 'discord.js';
import { pool } from '../../db';
import { partyUtils } from '../../utils/queryDB';

const deleteQueue = require('../moderation/deleteQueue');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('delete things')
    .addSubcommand(sub => sub.setName('queue').setDescription('List parties')
        .addStringOption(option =>
        option.setName('queue-name')
            .setDescription('The queue name you would like to cancel')
            .setRequired(true)
            .setAutocomplete(true)
		)
    ),

  async execute(interaction: ChatInputCommandInteraction) {

    if (interaction.options.getSubcommand() === 'queue') {
    await deleteQueue.execute(interaction);
    }

  }
};
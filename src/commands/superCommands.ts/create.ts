import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle, AutocompleteInteraction  } from 'discord.js';
import { pool } from '../../db';
import { partyUtils } from '../../utils/queryDB';

const newQueue = require('../moderation/newQueue');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('create things')
    .addSubcommand(sub => sub.setName('queue').setDescription('Create a new queue embed')
    		// required
		.addStringOption(option =>
			option.setName('queue-name')
				.setDescription('Name of the queue')
				.setRequired(true)
				.setMaxLength(255))
		.addStringOption(option =>
			option.setName('queue-desc')
				.setDescription('A description for the queue')
				.setRequired(true)
				.setMaxLength(100))
		.addIntegerOption(option =>
			option.setName('default-elo')
				.setDescription('Default ELO for new players')
				.setRequired(true)
				.setMinValue(0))
		// optional
		.addIntegerOption(option =>
			option.setName('members-per-team')
				.setDescription('Number of members per team')
				.setRequired(false)
				.setMinValue(1))
		.addIntegerOption(option =>
			option.setName('number-of-teams')
				.setDescription('Number of teams per game')
				.setRequired(false)
				.setMinValue(2))
		.addIntegerOption(option =>
			option.setName('queue-elo-search-start')
				.setDescription('Starting ELO distance for searching players')
				.setRequired(false)
				.setMinValue(0))
		.addIntegerOption(option =>
			option.setName('queue-elo-search-increment')
				.setDescription('ELO distance increment for searching players')
				.setRequired(false)
				.setMinValue(0))
		.addIntegerOption(option =>
			option.setName('queue-elo-search-speed')
				.setDescription('Speed of ELO increment (in seconds)')
				.setRequired(false)
				.setMinValue(1))
		.addIntegerOption(option =>
			option.setName('minimum-elo')
				.setDescription('Minimum ELO')
				.setRequired(false)
				.setMinValue(-1000))
		.addIntegerOption(option =>
			option.setName('maximum-elo')
				.setDescription('Maximum ELO')
				.setRequired(false)
				.setMinValue(1))
        .addIntegerOption(option =>
			option.setName('max-party-elo-difference')
				.setDescription('Maximum ELO')
				.setRequired(false)
				.setMinValue(1))
    ),
  async execute(interaction: ChatInputCommandInteraction) {

    if (interaction.options.getSubcommand() === 'queue') {
    await newQueue.execute(interaction);
    }

  }
};
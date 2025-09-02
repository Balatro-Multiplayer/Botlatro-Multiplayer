import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle, AutocompleteInteraction  } from 'discord.js';
import { pool } from '../../db';
import { partyUtils } from '../../utils/queryDB';

const setPriorityQueue = require('../queues/setPriorityQueue');
const chamgeMMR = require('../moderation/changeMMR');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('sets things to a certain value')
    
    .addSubcommand(sub => sub.setName('priority-queue').setDescription('Set a priority queue for when you queue in multiple queues')
        .addStringOption(option => option
            .setName('queue-name')
            .setDescription('The queue you would like to prioritize')
            .setRequired(true)
            .setAutocomplete(true)
		)
    )
    .addSubcommand(sub => sub.setName('mmr').setDescription('[ADMIN] Set a users MMR in a specific queue')
        .addUserOption(option => option
            .setName('user')
            .setDescription('The user whose MMR you want to change')
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName('queue-name')
            .setDescription('The queue that you are changing the mmr in')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addNumberOption(option => option
            .setName('new-elo')
            .setDescription('The new elo to set the user to')
            .setRequired(true)
        )
),

  async execute(interaction: ChatInputCommandInteraction) {

        if (interaction.options.getSubcommand() === 'priority-queue') {
        await setPriorityQueue.execute(interaction);
        } else if (interaction.options.getSubcommand() === 'mmr') {
        await chamgeMMR.execute(interaction);
        }

  },

    async autocomplete(interaction: AutocompleteInteraction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'priority-queue') {
        await setPriorityQueue.autocomplete(interaction);
        } else if (subcommand === 'mmr') {
        await chamgeMMR.autocomplete(interaction);
        }
  }

};
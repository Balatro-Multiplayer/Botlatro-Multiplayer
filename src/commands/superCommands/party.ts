import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle, AutocompleteInteraction  } from 'discord.js';
import { pool } from '../../db';
import { partyUtils } from '../../utils/queryDB';

const partyCheckUsers = require('../party/partyCheckUsers');
const partyCreate = require('../party/partyCreate');
const partyDisband = require('../party/partyDisband');
const partyInvite = require('../party/partyInvite');
// const partyJoin = require('../party/partyJoin');
const partyLeave = require('../party/partyLeave');
// const partyPromote = require('../party/partyPromote');
const partyKick = require('../party/partyKick');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('party')
    .setDescription('party commands')
    
    .addSubcommand(sub => sub.setName('list-users').setDescription('List all users in your party'))
    .addSubcommand(sub => sub.setName('create').setDescription('Create a party')
        .addStringOption(option => option
            .setName('party-name')
            .setDescription('Name your party')
            .setRequired(false))
    )
    .addSubcommand(sub => sub.setName('disband').setDescription('Disband your current party'))
    .addSubcommand(sub => sub.setName('invite').setDescription('Invite a user to your party')
        .addUserOption(option => option  
            .setName('member')
            .setDescription('The member you would like to invite to your party')
            .setRequired(true))
    )
    .addSubcommand(sub => sub.setName('join').setDescription('Join a party that you have a pending invite to'))
    .addSubcommand(sub => sub.setName('leave').setDescription('Leave your current party'))
    .addSubcommand(sub => sub.setName('promote').setDescription('Promote a user in your party to be the new leader'))
    .addSubcommand(sub => sub.setName('kick').setDescription('Remove a user from your party')
        .addStringOption(option => option
            .setName('user')
            .setDescription('The user you would like to remove from your party')
            .setAutocomplete(true)
            .setRequired(true))
),

    async execute(interaction: ChatInputCommandInteraction) {

        if (interaction.options.getSubcommand() === 'list-users') {
        await partyCheckUsers.execute(interaction);
        } else if (interaction.options.getSubcommand() === 'create') {
        await partyCreate.execute(interaction);
        } else if (interaction.options.getSubcommand() === 'disband') {
        await partyDisband.execute(interaction);
        } else if (interaction.options.getSubcommand() === 'invite') {
        await partyInvite.execute(interaction);
        } else if (interaction.options.getSubcommand() === 'join') {
        // await partyJoin.execute(interaction);
        } else if (interaction.options.getSubcommand() === 'leave') {
        await partyLeave.execute(interaction);
        } else if (interaction.options.getSubcommand() === 'promote') {
        // await partyPromote.execute(interaction);
        } else if (interaction.options.getSubcommand() === 'kick') {
        await partyKick.execute(interaction);
        }

    },

    async autocomplete(interaction: AutocompleteInteraction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'kick') {
        await partyKick.autocomplete(interaction);
        }
        
    }
};
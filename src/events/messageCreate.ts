import { ActionRowBuilder, APIActionRowComponent, APIEmbedField, APIStringSelectComponent, ButtonBuilder, ButtonStyle, Events, Interaction, MessageComponentInteraction, MessageFlags, StringSelectMenuBuilder, StringSelectMenuComponent, StringSelectMenuInteraction, StringSelectMenuOptionBuilder, TextChannel } from 'discord.js';
import { pool } from '../db';
import { updateQueueMessage, matchUpGames, timeSpentInQueue, createMatch } from '../utils/queueHelpers';
import { customDecks, decks, endMatch, getTeamsInMatch, setupDeckSelect } from '../utils/matchHelpers';
import { closeMatch, getActiveQueues, getMatchData, getQueueSettings, getUserPriorityQueueId, getUserQueues, getUsersInQueue, partyUtils, setUserPriorityQueue, userInMatch, userInQueue } from '../utils/queryDB';
import { QueryResult } from 'pg';
import { Queues, Settings } from 'psqlDB';
import { handleTwoPlayerMatchVoting, handleVoting } from '../utils/voteHelpers';
import { getSettings } from '../utils/queryDB';
import client from '../index';
import * as fs from 'fs';
import * as path from 'path';

module.exports = {
  name: Events.MessageCreate,
    async execute(message: any) {
        try {
            
            if (message.author.bot) return;

            const guild = message.guild;
            const channel = message.channel;
            const category = channel?.parent;
            const content = message.content;
            const attachments = message.attachments;

            if (!guild || !channel || !category) return;

            // check if message is in queue category
            const settings = await getSettings()
            const queueCategory = settings.queue_category_id;
            if (category.id !== queueCategory) return;

            // ensure message is not in queue channel or queue results channel
            const queueChannelId = settings.queue_channel_id;
            const queueResultsChannelId = settings.queue_results_channel_id;
            if ( (channel.id === queueChannelId) || (channel.id === queueResultsChannelId) ) return;

            console.log(` -- Message sent -- \n${content} \n${attachments.map((a: any) => a.url)} `);

            const outputFilePath: string = path.join(__dirname, '..', 'logs', `${channel.name}_${channel.id}.log`);
            const hourTime = new Date().toTimeString().split(' ')[0].split(':')
            fs.appendFileSync(
                outputFilePath,
                `[${hourTime[0]}:${hourTime[1]}] ${message.author.tag}: ${content} ${attachments.map((a: any) => a.url).join(' ')}\n`,
                'utf8'
            )


        } catch (err) {
            console.error('Error in messageCreate event:', err);
        }
    }
}
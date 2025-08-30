import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, Interaction, MessageComponentInteraction, MessageFlags, StringSelectMenuComponent, StringSelectMenuInteraction, TextChannel } from 'discord.js';
import { pool } from '../db';
import { updateQueueMessage, matchUpGames, timeSpentInQueue, queueUsers } from '../utils/queueHelpers';
import { endMatch, getTeamsInMatch } from '../utils/matchHelpers';
import { closeMatch, getMatchData, partyUtils, userInMatch, userInQueue } from '../utils/queryDB';
import { QueryResult } from 'pg';
import { Queues } from 'psqlDB';
import { handleTwoPlayerMatchVoting, handleVoting } from '../utils/voteHelpers';

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    // Slash commands
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(err);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error.', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'There was an error.', flags: MessageFlags.Ephemeral });
            }
        }
    }
    //autocomplete interactions
    if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) return;
        try {
            await command.autocomplete(interaction);
        } catch (err) {
            console.error(err);
        }
    }

    // Select Menu Interactions
    if (interaction.isStringSelectMenu()) {
        console.log(interaction.customId);
       if (interaction.customId === "join-queue") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const selectedQueueIds = interaction.values;
            const allQueues: QueryResult<Queues> = await pool.query(`SELECT * FROM queues`);

            // party checks
            const partyId = await partyUtils.getUserParty(interaction.user.id);
            if (partyId) {
                const partyList = await partyUtils.getPartyUserList(partyId);
                for (let qId of selectedQueueIds) {
                    const queueId = parseInt(qId);
                    const queue = allQueues.rows.find(q => q.id === queueId);
                    if (queue && partyList && partyList.length > queue.members_per_team) {
                        await interaction.followUp({
                            content: `Your party has too many members for the ${queue.queue_name} queue.`,
                            flags: MessageFlags.Ephemeral,
                        });
                        return;
                    }
                }

                const isLeader = await pool.query(
                    `SELECT is_leader FROM party_users WHERE user_id = $1`,
                    [interaction.user.id]
                );
                if (!(isLeader?.rows[0]?.is_leader ?? null)) {
                    await interaction.followUp({
                        content: `You're not the party leader.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                // TODO: check for bans
            }

            // in match check
            const inMatch = await userInMatch(interaction.user.id);
            if (inMatch) {
                const matchId = await pool.query(
                    `SELECT match_id FROM match_users WHERE user_id = $1`,
                    [interaction.user.id]
                );
                const matchData = await pool.query(
                    `SELECT * FROM matches WHERE id = $1`,
                    [matchId.rows[0].match_id]
                );

                await interaction.followUp({
                    content: `You're already in a match! <#${matchData.rows[0].channel_id}>`,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // ensure user exists, if it doesn't, create
            const matchUser = await pool.query(
                "SELECT * FROM users WHERE user_id = $1",
                [interaction.user.id]
            );

            if (matchUser.rows.length < 1) {
                await pool.query(
                    "INSERT INTO users (user_id) VALUES ($1)",
                    [interaction.user.id]
                );
            }

            await pool.query(`
                UPDATE queue_users
                SET queue_join_time = NULL
                WHERE user_id = $1`,
                [interaction.user.id]
            );

            const joinedQueues: string[] = [];
            for (const qId of selectedQueueIds) {
                const queueId = parseInt(qId);
                const queue = allQueues.rows.find(q => q.id === queueId);
                if (!queue) continue;

                const res = await pool.query(
                    `UPDATE queue_users
                    SET queue_join_time = NOW()
                    WHERE user_id = $1 AND queue_id = $2
                    RETURNING *;`,
                    [interaction.user.id, queueId]
                );

                // if not already in that queue, insert
                if (res.rows.length < 1) {
                    await pool.query(
                        `INSERT INTO queue_users (user_id, elo, peak_elo, queue_id, queue_join_time)
                        VALUES ($1, $2::real, $2::real, $3, NOW())`,
                        [interaction.user.id, queue.default_elo, queueId]
                    );
                }

                joinedQueues.push(queue.queue_name);
            }

            await updateQueueMessage();

            await interaction.followUp({
                content: joinedQueues.length > 0
                    ? `You joined: ${joinedQueues.join(", ")}`
                    : "You left the queue.",
                flags: MessageFlags.Ephemeral,
            });
        }

        if (interaction.values[0].includes('winmatch_')) {
            const customSelId = interaction.values[0];
            const matchId = parseInt(customSelId.split('_')[1]);
            const matchUsers = await getTeamsInMatch(matchId);
            const matchUsersArray = matchUsers.flatMap(t => t.users.map(u => u.user_id));

            await handleTwoPlayerMatchVoting(interaction, {
                participants: matchUsersArray,
                onComplete: async (interaction, winner) => {
                    const customSelId = interaction.values[0];
                    const matchData: string[] = customSelId.split('_');
                    const matchId = matchData[1];
                    await pool.query(
                        `UPDATE matches SET winning_team = $1 WHERE id = $2`,
                        [winner, matchId]
                    );
                    await endMatch(parseInt(matchId));
                    interaction.update({ content: 'The match has ended!', embeds: [], components: [] });
                }
            });
        }
    }

    // Button interactions
    if (interaction.isButton()) {
        if (interaction.customId == 'leave-queue') {
            try {
               await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const inQueue = await userInQueue(interaction.user.id);
                if (interaction.customId === 'leave-queue' && !inQueue) {
                    await interaction.followUp({ content: `You're not in the queue.`, flags: MessageFlags.Ephemeral });
                    return;
                }

                // Update the user's queue status and join with the queues table based on channel id
                await pool.query(`
                    UPDATE queue_users
                    SET queue_join_time = NULL
                    WHERE user_id = $1
                `, [interaction.user.id]);

                await updateQueueMessage();
                await interaction.followUp({ content: `You left the queue!`, flags: MessageFlags.Ephemeral });
            } catch (err) {
                console.error(err);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error.', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: 'There was an error.', flags: MessageFlags.Ephemeral });
                }
            }
        }
        if (interaction.customId === 'check-queued') {
            const inQueue = await userInQueue(interaction.user.id);

            if (inQueue) {
                const timeSpent = await timeSpentInQueue(interaction.user.id)
                await interaction.reply({ content: `You are in the queue!\nJoined queue ${timeSpent}.`, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: `You are not currently in the queue.`, flags: MessageFlags.Ephemeral });
            }
        }
        if (interaction.customId.startsWith('cancel-')) {
            const matchId = parseInt(interaction.customId.split('-')[1]);
            const matchUsers = await getTeamsInMatch(matchId);
            const matchUsersArray = matchUsers.flatMap(t => t.users.map(u => u.user_id));

             await handleVoting(interaction, {
                voteType: "Cancel Match?",
                embedFieldIndex: 2,
                participants: matchUsersArray,
                onComplete: async (interaction) => {
                    await closeMatch(matchId)
                    await interaction.update({ content: 'The match has been cancelled.', embeds: [], components: [] });
                }
            });

           
        }
        if (interaction.customId.startsWith('call-helpers-')) {
            const matchId = parseInt(interaction.customId.split('-')[1]);
            // TODO: Make helpers call stuff
        }
        if (interaction.customId.startsWith('rematch-')) {
            const matchId = parseInt(interaction.customId.split('-')[1]);
            const matchData = await getMatchData(matchId);
            const matchUsers = await getTeamsInMatch(matchId);
            const matchUsersArray = matchUsers.flatMap(t => t.users.map(u => u.user_id));

            await handleVoting(interaction, {
                voteType: "Rematch Votes",
                embedFieldIndex: 2,
                participants: matchUsersArray,
                onComplete: async (interaction, { embed }) => {
                    await queueUsers(matchUsersArray, matchData.queue_id);
                    await interaction.update({
                        content: 'A Rematch for this matchup has begun!',
                        embeds: [embed],
                        components: []
                    });
                }
            });
        }
        // accept party invite
        if (interaction.customId.startsWith('accept-party-invite-')) {
            const memberId = interaction.customId.split('-').pop(); // id of the user who sent the invite
            if (!memberId) { // should never happen
                await interaction.reply({ content: 'Invalid invite.', flags: MessageFlags.Ephemeral });
                return;
            }

            const client = (await import('../index')).default; 
            const guild = client.guilds.cache.get(process.env.GUILD_ID!) 
                ?? await client.guilds.fetch(process.env.GUILD_ID!);

            const member = await guild.members.fetch(memberId);
            if (!member) { // should never happen
                await interaction.reply({ content: 'Member not found.', flags: MessageFlags.Ephemeral });
                return;
            }

            const partyId = await partyUtils.getUserParty(member.user.id); // get party id
            const sendTime = interaction.message.createdTimestamp;
            const currentTime = Date.now();
            if (currentTime - sendTime > 5 * 60 * 1000 // greater than 5 minutes
            || !partyId) { // if party no longer exists
                await interaction.reply({ content: 'This invite has expired.', flags: MessageFlags.Ephemeral });
                return;
            }

            try {
                await pool.query(
                    `UPDATE users SET joined_party_id = $1 WHERE user_id = $2`,
                    [partyId, interaction.user.id]
                );
                const partyName = await partyUtils.getPartyName(partyId);
                await interaction.reply({ content: `Joined ${partyName}!`, flags: MessageFlags.Ephemeral });
                await member.send({
                    content: `**${interaction.user.displayName}** has joined your party!`
                });
            } catch (err) {
                console.error(err);
                await interaction.reply({ content: `Failed to join ${member.user.username}'s party.`, flags: MessageFlags.Ephemeral });
            }
        }
    }
  }
};

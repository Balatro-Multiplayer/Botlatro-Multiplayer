import { Events, Interaction, MessageFlags, TextChannel } from 'discord.js';
import { pool } from '../db';
import { updateQueueMessage, matchUpGames, timeSpentInQueue } from '../utils/queueHelpers';
import { cancelMatch, endMatch } from '../utils/matchHelpers';
import { partyUtils, userInMatch, userInQueue } from '../utils/queryDB';

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
    if (interaction.isAnySelectMenu()) {
        // winmatch_1_0 as an example, matchId then teamId
        if (interaction.values[0].includes('winmatch_')) {
            const winMatchData: string[] = interaction.values[0].split('_');
            await endMatch(parseInt(winMatchData[2]), parseInt(winMatchData[1]));
            interaction.update({ content: 'The match has ended!', embeds: [], components: [] });
        }
    }

    // Button interactions
    if (interaction.isButton()) {
        if (interaction.customId === 'join-queue' || interaction.customId === 'leave-queue') {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                // Fetch the queue data linked to the channel id
                const queue = await pool.query(
                    `SELECT * FROM queues WHERE channel_id = $1`, 
                    [interaction.channelId]);

                // checks that occur if a user is in a party:
                const partyId = await partyUtils.getUserParty(interaction.user.id);
                if (partyId) {
                    // size of party check
                    const partyList = partyId ? await partyUtils.getPartyUserList(partyId) : null;
                    if (partyList && partyList.length > queue.rows[0].members_per_team) {
                        await interaction.followUp({ content: `Your party has too many members for this queue.`, flags: MessageFlags.Ephemeral });
                        return;
                    }

                    // party leader check
                    const isLeader = await pool.query(`SELECT is_leader FROM party_users WHERE user_id = $1`, [interaction.user.id]);
                    if (!(isLeader?.rows[0]?.is_leader ?? null)) {
                        await interaction.followUp({ content: `You're not the party leader.`, flags: MessageFlags.Ephemeral });
                        return;
                    }

                    //TODO: add ban check for every party member, also add ban check for solo queuers
                }

                const inMatch = await userInMatch(interaction.user.id);
                if (interaction.customId === 'join-queue' && inMatch) {
                    const matchId = await pool.query(
                    `SELECT match_id FROM match_users WHERE user_id = $1`,
                    [interaction.user.id]);

                    const matchData = await pool.query(
                    `SELECT * FROM matches WHERE id = $1`,
                    [matchId.rows[0].match_id]);

                    await interaction.followUp({ content: `You're already in a match! <#${matchData.rows[0].channel_id}>`, flags: MessageFlags.Ephemeral });
                    return;
                }

                const inQueue = await userInQueue(interaction.user.id, interaction.channel as TextChannel);
                if (interaction.customId === 'leave-queue' && !inQueue) {
                    await interaction.followUp({ content: `You're not in this queue.`, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (interaction.customId === 'join-queue' && inQueue) {
                    await interaction.followUp({ content: `You're already in this queue.`, flags: MessageFlags.Ephemeral });
                    return;
                }

                // Update the user's queue status and join with the queues table based on channel id
                const user = await pool.query(`
                    UPDATE queue_users
                    SET queue_join_time = 
                        CASE 
                            WHEN $1 AND users.match_id IS NULL AND queue_users.queue_join_time IS NULL THEN NOW()
                            ELSE NULL
                        END
                    FROM users
                    WHERE queue_users.user_id = users.user_id
                        AND queue_users.queue_channel_id = $2
                        AND queue_users.user_id = $3
                    RETURNING queue_users.*;
                    `, [interaction.customId === 'join-queue', interaction.channelId, interaction.user.id]);

                // Ensure user exists and create if not
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

                // Ensure user exists for this queue and create it if not
                if (user.rows.length < 1) {
                    await pool.query(`
                        INSERT INTO queue_users (user_id, elo, peak_elo, queue_channel_id, queue_join_time)
                        VALUES ($1, $2, $2, $3, NOW())
                        `, [interaction.user.id, queue.rows[0].default_elo, interaction.channelId]);
                }

                await updateQueueMessage(interaction.channel as TextChannel, false);
                await matchUpGames();
                await interaction.followUp({ content: `You ${user.rows[0]?.queue_join_time === null ? "left" : "joined"} the ${queue.rows[0].queue_name} Queue!`, flags: MessageFlags.Ephemeral });
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
            const inQueue = await userInQueue(interaction.user.id, interaction.channel as TextChannel);

            if (inQueue) {
                const timeSpent = await timeSpentInQueue(interaction.user.id, interaction.channel as TextChannel)
                await interaction.reply({ content: `You **are** in the queue!\nJoined queue ${timeSpent}.`, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: `You're **not** currently in this queue.`, flags: MessageFlags.Ephemeral });
            }
        }
        if (interaction.customId.startsWith('cancel-')) {
            const matchId = parseInt(interaction.customId.split('-')[1])
            cancelMatch(matchId)
            await interaction.update({ content: 'The match has been cancelled.', embeds: [], components: [] });
        }
        if (interaction.customId.startsWith('call-helpers-')) {
            const matchId = parseInt(interaction.customId.split('-')[1]);
            // TODO: Make helpers call stuff
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

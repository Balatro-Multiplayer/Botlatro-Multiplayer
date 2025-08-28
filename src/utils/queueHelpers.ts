import { pool } from '../db';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, TextChannel, PermissionFlagsBits, Message } from 'discord.js';
import { sendMatchInitMessages } from './matchHelpers';
import { userInQueue } from './queryDB';
import client from '../index';

// Updates or sends a new queue message for the specified text channel  
export async function updateQueueMessage(): Promise<Message> {
    const response = await pool.query(
        'SELECT queue_channel_id, queue_message_id FROM settings',
    )

    const { 
        queue_channel_id: queueChannelId,
        queue_message_id: queueMessageId,
    } = response.rows[0];

     const embed = new EmbedBuilder()
        .setTitle(`Balatro Multiplayer Matchmaking Queue`)
        .setDescription(`Use the Select Menu to join the queue!`)
        .setColor('#ff0000');

    const leaveQueue = new ButtonBuilder()
        .setCustomId(`leave-queue`)
        .setLabel('Leave Queue')
        .setStyle(ButtonStyle.Danger);

    const checkQueued = new ButtonBuilder()
        .setCustomId(`check-queued`)
        .setLabel('Check Queued State')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(leaveQueue, checkQueued);

    let msg;
    if (queueMessageId && queueMessageId != 'null') {
        msg = await queueChannelId.messages.fetch(queueMessageId);
        await msg.edit({ embeds: [embed], components: [row] });
        return msg;
    } 

    const queueChannel = (await client.channels.fetch(queueChannelId)) as TextChannel;
    msg = await queueChannel.send({ embeds: [embed], components: [row] });
    await pool.query(
        'UPDATE settings SET queue_message_id = $1',
        [msg.id]
    );
    return msg;
}


// Matches up users in queues
export async function matchUpGames(): Promise<void> {
    try {
        // Get all users in unlocked queues
        const response = await pool.query(`
            SELECT u.*, q.number_of_teams, q.members_per_team, q.elo_search_start, q.elo_search_speed, q.elo_search_increment
            FROM queue_users u
            JOIN queues q
                ON u.queue_id = q.id
            WHERE u.queue_join_time IS NOT NULL
                AND q.locked = false;
        `);

        // Group users by queue
        const queues: Record<string, any[]> = {};
        for (const row of response.rows) {
            if (!queues[row.queue_channel_id]) queues[row.queue_channel_id] = [];
            queues[row.queue_channel_id].push(row);
        }

        let possibleMatches: any[] = [];

        for (const [queueId, users] of Object.entries(queues)) {

            // Get queue settings
            const numberOfTeams = users[0].number_of_teams;
            const membersPerTeam = users[0].members_per_team;
            const totalPlayers = numberOfTeams * membersPerTeam;

            if (users.length < totalPlayers) continue;

            // Generate all possible combinations of users for a match
            const combinations = getCombinations(users, totalPlayers);

            for (const combo of combinations) {
                // Check ELO difference across the combination
                let minQueueTime = Math.min(...combo.map(u => new Date(u.queue_join_time).getTime()));

                const userDistance = Math.abs(minQueueTime - Date.now());
                const defaultDistance = users[0].elo_search_start;
                const intervalTime = users[0].elo_search_speed * 1000;
                const intervalSize = users[0].elo_search_increment;

                const secondsInQueue = Math.floor(userDistance / 1000);
                const intervalsPassed = Math.floor(secondsInQueue / intervalTime);
                const allowedDistance = defaultDistance + (intervalsPassed * intervalSize);

                // Check if users can be matched based on ELO
                const minElo = Math.min(...combo.map(u => u.elo));
                const maxElo = Math.max(...combo.map(u => u.elo));
                const eloDifference = Math.abs(maxElo - minElo);
                if (eloDifference > allowedDistance) continue;

                possibleMatches.push({ eloDifference, queueId, users: combo });
            }
        }

        possibleMatches.sort((a, b) => a.eloDifference - b.eloDifference);

        console.log(possibleMatches);

        const usedUsers: Set<string> = new Set();
        for (const match of possibleMatches) {
            const { users, queueId } = match;

            // Check if all users in this match are still available
            if (users.some((u: Record<string, any>) => usedUsers.has(u.user_id))) continue;

            // Mark users as used
            users.forEach((u: Record<string, any>) => usedUsers.add(u.user_id));

            queueUsers(users.map((u: Record<string, any>) => u.user_id), queueId)
        }

    } catch (err) {
        console.error('Error checking for queues:', err);
    }
}

// Returns all combinations of arr of length k
function getCombinations<T>(arr: T[], k: number): T[][] {
    const results: T[][] = [];
    function helper(start: number, combo: T[]) {
        if (combo.length === k) {
            results.push([...combo]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            helper(i + 1, combo);
            combo.pop();
        }
    }
    helper(0, []);
    return results;
}


// Queues players together and creates a match channel for them
export async function queueUsers(userIds: string[], queueId: string): Promise<void> {
    const queue = await pool.query('SELECT id, category_id FROM queues WHERE channel_id = $1', [queueId]);

    const client = (await import('../index')).default;
    const guild = client.guilds.cache.get(process.env.GUILD_ID!) 
        ?? await client.guilds.fetch(process.env.GUILD_ID!);
    if (!guild) throw new Error('Guild not found');
    const channel = await guild.channels.create({
        name: "reserved-match-channel",
        type: ChannelType.GuildText,
        parent: queue.rows[0].category_id,
        permissionOverwrites: [
            {
                id: guild.roles.everyone,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            ...userIds.map(userId => ({
                id: userId,
                allow: [PermissionFlagsBits.ViewChannel],
                type: 1,
            })),
        ]
    })

    const response = await pool.query(`
        INSERT INTO matches (queue_id, channel_id)
        VALUES ($1, $2)
        RETURNING id
    `, [queue.rows[0].id, channel.id]);

    const matchId = response.rows[0].id;

    channel.setName(`match-${matchId}`);

    for (const userId of userIds) {
        await pool.query(
            'UPDATE queue_users SET queue_join_time = NULL WHERE user_id = $1',
            [userId]
        );
        await pool.query(`
            INSERT INTO match_users (user_id, match_id, team)
            VALUES ($1, $2, $3)
        `, [userId, matchId, userIds.indexOf(userId)+1]);

        const member = await guild.members.fetch(userId);
        try {
            member.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Match Found!')
                        .setDescription(`**Match Channel**\n<#${channel.id}>`)
                        .setColor(0x00FF00)
                ]
            })
        } catch (err) {}
    }

    updateQueueMessage();

    // Send queue start messages
    await sendMatchInitMessages(matchId, channel)
}

export async function timeSpentInQueue(userId: string, textChannel: TextChannel): Promise<string | null> {
    if (!(await userInQueue(userId, textChannel))) return null;

    const response = await pool.query(
        `SELECT queue_join_time FROM queue_users WHERE user_id = $1 AND queue_channel_id = $2`,
        [userId, textChannel.id]
    );

    if (response.rows.length === 0) return null;

    const joinTime = new Date(response.rows[0].queue_join_time);
    const timeSpent = Math.floor(joinTime.getTime() / 1000); // Convert to seconds for Discord timestamp
    return `<t:${timeSpent}:R>`;
}
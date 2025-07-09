import { pool } from '../db';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from 'discord.js';

export async function getUsersInQueue(textChannel: TextChannel): Promise<string[]> {
    const response = await pool.query(`
        SELECT u.user_id FROM queue_users u
        JOIN queues q ON u.queue_channel_id = q.channel_id
        WHERE q.channel_id = $1 AND u.queue_join_time IS NOT NULL`,
        [textChannel.id]
    );

    return response.rows.map(row => row.user_id);
}


export async function updateQueueMessage(textChannel: TextChannel, newMessage: boolean): Promise<void> {
    const response = await pool.query(
        'SELECT message_id, queue_name, number_of_teams, members_per_team FROM queues WHERE channel_id = $1',
        [textChannel.id]
    )

    if (response.rows.length < 1) throw new Error('Queue not found for this channel');

    const { 
        message_id: messageId,
        queue_name: queueName, 
        number_of_teams: numberOfTeams, 
        members_per_team: membersPerTeam
    } = response.rows[0];

    let msg;
    
    const lastMessage = (await textChannel.messages.fetch({ limit: 1 })).first();
    if (lastMessage && messageId !== lastMessage.id) newMessage = true;

    try {
        msg = await textChannel.messages.fetch(messageId);
        if (newMessage) await msg.delete();
    } catch (err) {}
    
    const matchType = `${membersPerTeam}v`.repeat(numberOfTeams).slice(0, -1);
    const playerCount = (await getUsersInQueue(textChannel)).length;

    const embed = new EmbedBuilder()
        .setTitle(`${queueName} Queue (${matchType})`)
        .setDescription(`${playerCount} player${playerCount !== 1 ? 's' : ''} in queue`)
        .setColor(0xFF0000);

    const joinQueue = new ButtonBuilder()
        .setCustomId('join-queue')
        .setLabel('Join Queue')
        .setStyle(ButtonStyle.Primary);

    const leaveQueue = new ButtonBuilder()
        .setCustomId('leave-queue')
        .setLabel('Leave Queue')
        .setStyle(ButtonStyle.Danger);

    const checkQueued = new ButtonBuilder()
        .setCustomId('check-queued')
        .setLabel('Check Queued State')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(joinQueue, leaveQueue, checkQueued);

    if (newMessage || !msg) {
        const newMsg = await textChannel.send({ embeds: [embed], components: [row] });
        await pool.query(
            'UPDATE queues SET message_id = $1 WHERE channel_id = $2',
            [newMsg.id, textChannel.id]
        );
    } else {
        await msg.edit({ embeds: [embed], components: [row] });
    }
}


export async function checkForQueue(): Promise<void> {
    try {
        const response = await pool.query(`
            SELECT u.* FROM queue_users u
            JOIN queues q ON u.queue_channel_id = q.channel_id
            WHERE u.queue_join_time IS NOT NULL
            AND q.locked = false`);

        let possibleQueues = []; 

        for (let i = 0; i < response.rows.length; i++) {
            const user1 = response.rows[i];
            const queue = await pool.query(
                'SELECT * FROM queues WHERE channel_id = $1',
                [user1.queue_channel_id]
            );

            for (let j = i+1; j < response.rows.length; j++) {
                const user2 = response.rows[j];
                if (user1.id === user2.id) continue;
                if (user2.queue_channel_id !== user1.queue_channel_id) continue;

                const eloDifference = Math.abs(user1.elo - user2.elo);
                let longestQueueUser = user1.queue_join_time.getTime() > user2.queue_join_time.getTime() ? user2 : user1;
                
                const userDistance = Math.abs(longestQueueUser.queue_join_time.getTime() - Date.now());

                const defaultDistance = queue.rows[0].elo_search_start;
                const intervalTime = queue.rows[0].elo_search_speed * 1000;
                const intervalSize = queue.rows[0].elo_search_increment;

                const secondsInQueue = Math.floor(userDistance / 1000);
                const intervalsPassed = Math.floor(secondsInQueue / intervalTime);
                const allowedDistance = defaultDistance + (intervalsPassed * intervalSize);

                // Add to list if the elo difference is within the allowed distance
                if (eloDifference <= allowedDistance)
                    possibleQueues.push([user1, user2, eloDifference]);
            }
        }
            // const client = (await import('../index')).default;
            // let textChannel;
            // try {
            //     textChannel = await client.channels.fetch(user1.queue_channel_id) as TextChannel;
            // } catch (err) {}
            // if (!textChannel) return;

            console.log(possibleQueues);

            // await updateQueueMessage(textChannel, false);
    } catch (err) {
        console.error('Error checking for queues:', err);
    }
}


export async function userInQueue(userId: string, textChannel: TextChannel): Promise<boolean> {
    const response = await pool.query(`
        SELECT * FROM queue_users
        WHERE user_id = $1 AND queue_channel_id = $2 AND queue_join_time IS NOT NULL`,
        [userId, textChannel.id]
    );

    return response.rows.length > 0;
}
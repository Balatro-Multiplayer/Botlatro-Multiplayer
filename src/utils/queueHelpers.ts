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

    const msg = await textChannel.messages.fetch(messageId);
    
    const lastMessage = (await textChannel.messages.fetch({ limit: 1 })).first();
    if (lastMessage && messageId !== lastMessage.id) newMessage = true;

    if (newMessage) {
        try {
            await msg.delete();
        } catch (err) {}
    }
    
    const matchType = `${membersPerTeam}v`.repeat(numberOfTeams).slice(0, -1);
    const playerCount = (await getUsersInQueue(textChannel)).length;

    const embed = new EmbedBuilder()
        .setTitle(`${queueName} Queue (${matchType})`)
        .setDescription(`${playerCount} player${playerCount !== 1 ? 's' : ''} in queue`)
        .setColor(0xFF0000);

    const toggleQueue = new ButtonBuilder()
        .setCustomId('toggle-queue')
        .setLabel('Join/Leave Queue')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(toggleQueue);

    if (newMessage) {
        const newMsg = await textChannel.send({ embeds: [embed], components: [row] });
        await pool.query(
            'UPDATE queues SET message_id = $1 WHERE channel_id = $2',
            [newMsg.id, textChannel.id]
        );
    } else {
        await msg.edit({ embeds: [embed], components: [row] });
    }
}


async function checkForQueue(): Promise<void> {
    const response = await pool.query(`
        SELECT * FROM queue_users uWHERE queue_join_time IS NOT NULL
        `, [channelId]
    );
}
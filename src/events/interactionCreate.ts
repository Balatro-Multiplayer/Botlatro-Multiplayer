import { Events, Interaction, MessageFlags, TextChannel } from 'discord.js';
import { pool } from '../db';
import { updateQueueMessage, checkForQueue, userInQueue } from '../utils/queueHelpers';

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

    // Button interactions
    if (interaction.isButton()) {
        if (interaction.customId === 'join-queue' || interaction.customId === 'leave-queue') {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const inQueue = await userInQueue(interaction.user.id, interaction.channel as TextChannel);
                if (interaction.customId === 'leave-queue' && !inQueue) {
                    await interaction.followUp({ content: 'You are not in this queue.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (interaction.customId === 'join-queue' && inQueue) {
                    await interaction.followUp({ content: 'You are already in this queue.', flags: MessageFlags.Ephemeral });
                    return;
                }
                // Update the user's queue status and join with the queues table based on channel id
                const user = await pool.query(`
                    UPDATE queue_users
                    SET queue_join_time = 
                        CASE 
                            WHEN $1 AND match_users_join.match_id IS NULL AND queue_users.queue_join_time IS NULL THEN NOW()
                            ELSE NULL
                        END
                    FROM match_users_join
                    WHERE queue_users.user_id = match_users_join.user_id
                        AND queue_users.queue_channel_id = $2
                        AND queue_users.user_id = $3
                    RETURNING queue_users.*;
                    `, [interaction.customId === 'join-queue', interaction.channelId, interaction.user.id]);

                // Fetch the queue data linked to the channel id
                const queue = await pool.query(
                    `SELECT * FROM queues WHERE channel_id = $1`, 
                    [interaction.channelId]);

                // If the user doesn't exist, create a new entry
                if (user.rows.length < 1) {
                    await pool.query(`
                        INSERT INTO queue_users (user_id, elo, peak_elo, queue_channel_id, queue_join_time)
                        VALUES ($1, $2, $2, $3, NOW())
                        `, [interaction.user.id, queue.rows[0].default_elo, interaction.channelId]);
                }

                // Ensure match_users_join exists for this user and create it if not
                const matchUser = await pool.query(
                    "SELECT * FROM match_users_join WHERE user_id = $1",
                    [interaction.user.id]
                );
                if (matchUser.rows.length < 1) {
                    await pool.query(
                        "INSERT INTO match_users_join (user_id) VALUES ($1)",
                        [interaction.user.id]
                    );
                }


                await updateQueueMessage(interaction.channel as TextChannel, false);
                await checkForQueue();
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
                await interaction.reply({ content: 'You **are** currently in this queue.', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'You are **not** currently in this queue.', flags: MessageFlags.Ephemeral });
            }
        }
    }
  }
};

import { Events, Interaction, MessageFlags, TextChannel } from 'discord.js';
import { pool } from '../db';
import { updateQueueMessage } from '../utils/queueHelpers';

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
        if (interaction.customId === 'toggle-queue') {
            try {
                // Update the user's queue status and join with the queues table based on channel id
                const user = await pool.query(`
                    UPDATE queue_users
                    SET queue_join_time = 
                        CASE 
                            WHEN match_users_join.match_id IS NULL AND queue_users.queue_join_time IS NULL THEN NOW()
                            ELSE NULL
                        END
                    FROM match_users_join
                    WHERE queue_users.user_id = match_users_join.user_id
                        AND queue_users.queue_channel_id = $1
                        AND queue_users.user_id = $2
                    RETURNING queue_users.*;
                    `, [interaction.channelId, interaction.user.id]);

                // Fetch the queue data linked to the channel id
                const queue = await pool.query(
                    `SELECT * FROM queues WHERE channel_id = $1`, 
                    [interaction.channelId]);

                if (user.rows.length < 1) {
                    await pool.query(`
                        INSERT INTO queue_users (user_id, elo, peak_elo, queue_channel_id, queue_join_time)
                        VALUES ($1, $2, $2, $3, NOW())
                        `, [interaction.user.id, queue.rows[0].default_elo, interaction.channelId]);
                }

                // Ensure match_users_join exists for this user
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

                // Update message
                await updateQueueMessage(interaction.channel as TextChannel, false);
                await interaction.reply({ content: `You ${user.rows[0]?.in_queue === false ? "left" : "joined"} the ${queue.rows[0].queue_name} Queue!`, flags: MessageFlags.Ephemeral });
            } catch (err) {
                console.error(err);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error.', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: 'There was an error.', flags: MessageFlags.Ephemeral });
                }
            }
        }
    }
  }
};

import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, AutocompleteInteraction } from 'discord.js';
import { pool } from '../../db';
import { getQueueNames } from '../../utils/queryDB'

module.exports = {
	data: new SlashCommandBuilder()
		.setName('delete-queue')
		.setDescription('Delete a queue. WARNING: THIS IS IRREVERSIBLE!')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
			option.setName('queue-name')
				.setDescription('The queue name you would like to cancel')
				.setRequired(true)
				.setAutocomplete(true)
		),
	async execute(interaction: ChatInputCommandInteraction) {
		try {
			// delete the queue from the database
            let queueName = interaction.options.getString('queue-name');
			const res = await pool.query('DELETE FROM queues WHERE queue_name = $1 RETURNING queue_name, channel_id, results_channel_id, message_id', [queueName]);
            if (res.rowCount === 0) {
                return interaction.reply(`Failed to delete queue ${queueName}.`)
            } 
			
			// delete the results channel
			const resultsChannel = await interaction.client.channels.fetch(res.rows[0].results_channel_id);
			if (resultsChannel) await resultsChannel.delete();

			// delete the queue message
			const queueMessageChannel = await interaction.client.channels.fetch(res.rows[0].channel_id);
			if (queueMessageChannel && queueMessageChannel.isTextBased()) {
				const messageId = res.rows[0].message_id;
				const message = await queueMessageChannel.messages.fetch(messageId);
				await message.delete();
			}

            return interaction.reply(`Successfully deleted ${queueName} from the queues list.`);

		} catch (err: any) {
			console.error(err);
			const errorMsg = err.detail || err.message || 'Unknown';
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content: `Failed to delete queue. Reason: ${errorMsg}` });
			} else {
				await interaction.reply({ content: `Failed to cancel match. Reason: ${errorMsg}`, flags: MessageFlags.Ephemeral });
			}
		}
	},
	async autocomplete(interaction: AutocompleteInteraction) {
		const currentValue = interaction.options.getFocused()
		const queueNames = await getQueueNames()
		const filteredQueueNames = queueNames.filter(name => 
			name.toLowerCase().includes(currentValue.toLowerCase())
		)
		await interaction.respond(
			filteredQueueNames.map(name => ({ name, value: name })).slice(0, 25) 
		)
	}
};

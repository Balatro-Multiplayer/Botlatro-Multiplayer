import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { pool } from '../../db';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('delete-queue')
		.setDescription('Delete a queue. WARNING: THIS IS IRREVERSIBLE!')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
			option.setName('queue-name')
				.setDescription('The queue name you would like to cancel')
				.setRequired(true)),
	async execute(interaction: ChatInputCommandInteraction) {
		try {
            let queueName = interaction.options.getString('queue-name');
			const res = await pool.query('DELETE FROM queues WHERE queue_name = $1 RETURNING queue_name', [queueName]);
            if (res.rowCount === 0) {
                return interaction.reply(`Failed to delete queue ${queueName}.`)
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
};

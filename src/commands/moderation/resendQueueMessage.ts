import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, TextChannel } from 'discord.js';
import { updateQueueMessage } from '../../utils/queueHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('resend-queue-message')
		.setDescription('Resends the queue message in the current channel')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction: ChatInputCommandInteraction) {

		try {
			const textChannel = interaction.channel as TextChannel;

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			await updateQueueMessage(textChannel, true);
			
			await interaction.deleteReply();
		} catch (err: any) {
			console.error(err);
			const errorMsg = err.detail || err.message || 'Unknown';
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content: `Failed to resend message. Reason: ${errorMsg}` });
			} else {
				await interaction.reply({ content: `Failed to resend message. Reason: ${errorMsg}`, flags: MessageFlags.Ephemeral });
			}
		}
	},
};

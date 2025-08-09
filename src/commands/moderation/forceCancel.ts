import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('force-cancel')
		.setDescription('Force cancels a specific match ID.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(option =>
			option.setName('match-id')
				.setDescription('Match ID to force cancel.')
				.setRequired(true)
				.setMinValue(0)),
	async execute(interaction: ChatInputCommandInteraction) {

		try {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		} catch (err: any) {
			console.error(err);
			const errorMsg = err.detail || err.message || 'Unknown';
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content: `Failed to cancel match. Reason: ${errorMsg}` });
			} else {
				await interaction.reply({ content: `Failed to cancel match. Reason: ${errorMsg}`, flags: MessageFlags.Ephemeral });
			}
		}
	},
};

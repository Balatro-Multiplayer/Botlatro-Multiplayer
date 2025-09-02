import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { closeMatch } from '../../utils/queryDB';
import { endMatch } from '../../utils/matchHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('cancel-match')
		.setDescription('Cancel a specific match')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option =>
			option.setName('match-id')
				.setDescription('The match ID to cancel')
				.setRequired(true)
				.setMinValue(0)),
	async execute(interaction: ChatInputCommandInteraction) {
		try {
			const matchId = interaction.options.getInteger('match-id');
			if (matchId === null) {
				await interaction.reply({ content: 'Invalid match ID provided.', flags: MessageFlags.Ephemeral });
				return;
			}

			const matchCancelCheck = await endMatch(matchId);
            
			if (matchCancelCheck) {
					interaction.reply({ content: `Successfully cancelled match ${matchId}` });
			} else {
					interaction.reply({ content: `Failed to cancel match ${matchId}.` });
			}
			
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

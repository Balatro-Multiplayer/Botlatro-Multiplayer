import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getRandomStake } from '../../utils/matchHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('random-stake')
		.setDescription('Get a random stake'),
	async execute(interaction: ChatInputCommandInteraction) {
		try {
      interaction.reply({ content: getRandomStake() });
		} catch (err: any) {
			console.error(err);
			const errorMsg = err.detail || err.message || 'Unknown';
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content: `Failed to send message. Reason: ${errorMsg}` });
			} else {
				await interaction.reply({ content: `Failed to send message. Reason: ${errorMsg}`, flags: MessageFlags.Ephemeral });
			}
		}
	},
};

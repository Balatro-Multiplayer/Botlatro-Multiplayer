import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getRandomDeck } from '../../utils/matchHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('random-deck')
		.setDescription('Get a random deck'),
	async execute(interaction: ChatInputCommandInteraction) {
		try {
            interaction.reply({ content: getRandomDeck() });
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

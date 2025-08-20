import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getRandomDeck } from '../../utils/matchHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('random-deck')
		.setDescription('Get a random deck')
		.addBooleanOption(option =>
			option.setName('custom-decks')
				.setDescription('Include custom BMP decks in random deck pool')
				.setRequired(true)),
	async execute(interaction: ChatInputCommandInteraction) {
		const customDecks = interaction.options.getBoolean('custom-decks') || false;

		try {
            interaction.reply({ content: getRandomDeck(customDecks) });
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

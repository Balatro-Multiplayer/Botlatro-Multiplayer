import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getRandomDeck } from '../../utils/matchHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('random-deck')
		.setDescription('Get a random deck')
		.addStringOption(option =>
			option.setName('custom-decks')
				.setDescription('Include custom BMP decks in random deck pool')
				.setRequired(false)
				.addChoices({ name: 'yes', value: 'true'})),
	async execute(interaction: ChatInputCommandInteraction) {
		const customDecks = interaction.options.getString('custom-decks') || null;
		let customDecksBoolean = false;
		if (customDecks == 'yes') { customDecksBoolean = true }

		try {
            interaction.reply({ content: getRandomDeck(customDecksBoolean) });
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

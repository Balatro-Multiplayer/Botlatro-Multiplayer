import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, AutocompleteInteraction } from 'discord.js';
import { getQueueIdFromName, getQueueNames, setUserPriorityQueue } from '../../utils/queryDB'

module.exports = {
	data: new SlashCommandBuilder()
		.setName('set-priority-queue')
		.setDescription('Set a priority queue for when you queue in multiple queues')
        .addStringOption(option =>
			option.setName('queue-name')
				.setDescription('The queue you would like to prioritize')
				.setRequired(true)
				.setAutocomplete(true)
		),
	async execute(interaction: ChatInputCommandInteraction) {
		try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const queueName = interaction.options.getString('queue-name', true);
            const queueId = await getQueueIdFromName(queueName);

            await setUserPriorityQueue(interaction.user.id, parseInt(queueId));

			return interaction.editReply({ content: `Successfully set **${queueName}** as your priority queue!` });

		} catch (err: any) {
			console.error(err);
			const errorMsg = err.detail || err.message || 'Unknown';
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content: `Failed to set priority queue. Reason: ${errorMsg}` });
			} else {
				await interaction.reply({ content: `Failed to set priority queue. Reason: ${errorMsg}`, flags: MessageFlags.Ephemeral });
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

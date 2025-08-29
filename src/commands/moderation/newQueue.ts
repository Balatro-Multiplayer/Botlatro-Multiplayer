import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, TextChannel } from 'discord.js';
import { pool } from '../../db';
import { updateQueueMessage } from '../../utils/queueHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('new-queue')
		.setDescription('Creates a new queue in the current channel (defaults to 1v1)')
    	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		// required
		.addStringOption(option =>
			option.setName('queue-name')
				.setDescription('Name of the queue')
				.setRequired(true)
				.setMaxLength(255))
		.addStringOption(option =>
			option.setName('queue-desc')
				.setDescription('A description for the queue')
				.setRequired(true)
				.setMaxLength(100))
		.addIntegerOption(option =>
			option.setName('default-elo')
				.setDescription('Default ELO for new players')
				.setRequired(true)
				.setMinValue(0))
		// optional
		.addIntegerOption(option =>
			option.setName('members-per-team')
				.setDescription('Number of members per team')
				.setRequired(false)
				.setMinValue(1))
		.addIntegerOption(option =>
			option.setName('number-of-teams')
				.setDescription('Number of teams per game')
				.setRequired(false)
				.setMinValue(2))
		.addIntegerOption(option =>
			option.setName('queue-elo-search-start')
				.setDescription('Starting ELO distance for searching players')
				.setRequired(false)
				.setMinValue(0))
		.addIntegerOption(option =>
			option.setName('queue-elo-search-increment')
				.setDescription('ELO distance increment for searching players')
				.setRequired(false)
				.setMinValue(0))
		.addIntegerOption(option =>
			option.setName('queue-elo-search-speed')
				.setDescription('Speed of ELO increment (in seconds)')
				.setRequired(false)
				.setMinValue(1))
		.addIntegerOption(option =>
			option.setName('minimum-elo')
				.setDescription('Minimum ELO')
				.setRequired(false)
				.setMinValue(-1000))
		.addIntegerOption(option =>
			option.setName('maximum-elo')
				.setDescription('Maximum ELO')
				.setRequired(false)
				.setMinValue(1))
        .addIntegerOption(option =>
			option.setName('max-party-elo-difference')
				.setDescription('Maximum ELO')
				.setRequired(false)
				.setMinValue(1)),

	async execute(interaction: ChatInputCommandInteraction) {
		// required 
		const queueName = interaction.options.getString('queue-name', true);
		const queueDesc = interaction.options.getString('queue-desc', true);
		const defaultElo = interaction.options.getInteger('default-elo', true);
		// optional
		const membersPerTeam = interaction.options.getInteger('members-per-team', false) ?? 1;
		const numberOfTeams = interaction.options.getInteger('number-of-teams', false) ?? 2;
		const eloSearchStart = interaction.options.getInteger('queue-elo-search-start', false) ?? 0;
		const eloSearchIncrement = interaction.options.getInteger('queue-elo-search-increment', false) ?? 1;
		const eloSearchSpeed = interaction.options.getInteger('queue-elo-search-speed', false) ?? 1;
		const minimumElo = interaction.options.getInteger('minimum-elo', false) ?? 0;
		const maximumElo = interaction.options.getInteger('maximum-elo', false) ?? 10000;
		const maxPartyEloDifference = interaction.options.getInteger('max-party-elo-difference', false) ?? Math.floor(defaultElo / 2);

		try {
			await pool.query(`
                INSERT INTO queues
				(queue_name, queue_desc, members_per_team, number_of_teams, elo_search_start, elo_search_increment, elo_search_speed, default_elo, minimum_elo, maximum_elo, max_party_elo_difference, locked)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                `, [
					queueName,
					queueDesc,
					membersPerTeam,
					numberOfTeams,
					eloSearchStart,
					eloSearchIncrement,
					eloSearchSpeed,
					defaultElo,
					minimumElo ?? null,
					maximumElo ?? null,
                    maxPartyEloDifference ?? null,
					false
				]
			);

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			await updateQueueMessage();
			await interaction.deleteReply();
		} catch (err: any) {
			console.error(err);
			const errorMsg = err.detail || err.message || 'Unknown';
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content: `Failed to create queue in database. Reason: ${errorMsg}` });
			} else {
				await interaction.reply({ content: `Failed to create queue in database. Reason: ${errorMsg}`, flags: MessageFlags.Ephemeral });
			}
		}
	},
};

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, TextChannel } from 'discord.js';
import { pool } from '../../db';
import { updateQueueMessage } from '../../utils/queueHelpers';

module.exports = {
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
			const nameCheck = await pool.query('SELECT 1 FROM queues WHERE queue_name = $1', [queueName]);
			const nameIsAvailable = nameCheck.rows.length === 0;
			if (!nameIsAvailable) {
			  await interaction.reply({ content: 'A queue with that name already exists.', flags: MessageFlags.Ephemeral });
			  return;
			}
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

			await updateQueueMessage();
			await interaction.reply({content: `Successfully created queue ${queueName}.`, flags: MessageFlags.Ephemeral});
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

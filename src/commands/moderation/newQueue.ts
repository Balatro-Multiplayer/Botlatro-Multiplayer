import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, TextChannel, ChannelType } from 'discord.js';
import { pool } from '../../db';
import { updateQueueMessage } from '../../utils/queueHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('new-queue')
		.setDescription('Creates a new queue in the current channel')
    	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addIntegerOption(option =>
			option.setName('members-per-team')
				.setDescription('Number of members per team')
				.setRequired(true)
				.setMinValue(1))
		.addIntegerOption(option =>
			option.setName('number-of-teams')
				.setDescription('Number of teams per game')
				.setRequired(true)
				.setMinValue(2))
		.addStringOption(option =>
			option.setName('queue-name')
				.setDescription('Name of the queue')
				.setRequired(true)
				.setMaxLength(255))
		.addChannelOption(option =>
			option.setName('category')
				.setDescription('Category where the new channels will be created for this queue')
				.setRequired(true)
				.addChannelTypes(4))
		.addIntegerOption(option =>
			option.setName('queue-elo-search-start')
				.setDescription('Starting ELO distance for searching players')
				.setRequired(true)
				.setMinValue(0))
		.addIntegerOption(option =>
			option.setName('queue-elo-search-increment')
				.setDescription('ELO distance increment for searching players')
				.setRequired(true)
				.setMinValue(0))
		.addIntegerOption(option =>
			option.setName('queue-elo-search-speed')
				.setDescription('Speed of ELO increment (in seconds)')
				.setRequired(true)
				.setMinValue(1))
		.addIntegerOption(option =>
			option.setName('default-elo')
				.setDescription('Default ELO for new players')
				.setRequired(true)
				.setMinValue(0))
		.addIntegerOption(option =>
			option.setName('minimum-elo')
				.setDescription('Minimum ELO')
				.setRequired(false)
				.setMinValue(0))
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
		const membersPerTeam = interaction.options.getInteger('members-per-team', true);
		const numberOfTeams = interaction.options.getInteger('number-of-teams', true);
		const queueName = interaction.options.getString('queue-name', true);
		const category = interaction.options.getChannel('category', true);
		const eloSearchStart = interaction.options.getInteger('queue-elo-search-start', true);
		const eloSearchIncrement = interaction.options.getInteger('queue-elo-search-increment', true);
		const eloSearchSpeed = interaction.options.getInteger('queue-elo-search-speed', true);
		const defaultElo = interaction.options.getInteger('default-elo', true);
		const minimumElo = interaction.options.getInteger('minimum-elo');
		const maximumElo = interaction.options.getInteger('maximum-elo');
		const maxPartyEloDifference = interaction.options.getInteger('max-party-elo-difference');

		try {
			const textChannel = interaction.channel as TextChannel;
			
			const client = (await import('../../index')).default;
			const guild = client.guilds.cache.get(process.env.GUILD_ID!) 
				?? await client.guilds.fetch(process.env.GUILD_ID!);
			if (!guild) throw new Error('Guild not found');
			const resultsChannel = await guild.channels.create({
				name: `${queueName.toLowerCase()}-results`,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: [
					{
						id: guild.roles.everyone,
						deny: [PermissionFlagsBits.SendMessages],
					}
				]
			})


			await pool.query(`
                INSERT INTO queues
				(queue_name, category_id, channel_id, results_channel_id, members_per_team, number_of_teams, elo_search_start, elo_search_increment, elo_search_speed, default_elo, minimum_elo, maximum_elo, max_party_elo_difference)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, $13)
                `, [
					queueName,
					category.id,
					textChannel.id,
					resultsChannel.id,
					membersPerTeam,
					numberOfTeams,
					eloSearchStart,
					eloSearchIncrement,
					eloSearchSpeed,
					defaultElo,
					minimumElo ?? null,
					maximumElo ?? null,
                    maxPartyEloDifference ?? null
				]
			);

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			await updateQueueMessage(textChannel, true);
			
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

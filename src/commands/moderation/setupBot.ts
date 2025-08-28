import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, TextChannel, ChannelType } from 'discord.js';
import { pool } from '../../db';
import { updateQueueMessage } from '../../utils/queueHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setup-bot')
		.setDescription('[ADMIN ONLY] Setup the initial settings for the bot')
    	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		// required
		.addChannelOption(option =>
			option.setName('queue-category')
				.setDescription('The category to put the queue channel into')
				.setRequired(true)
				.addChannelTypes(4))
		.addRoleOption(option =>
			option.setName('helper-role')
				.setDescription('The role for helpers')
				.setRequired(true)),
	async execute(interaction: ChatInputCommandInteraction) {

		try {
			const category = interaction.options.getChannel('queue-category', true);
			const helperRole = interaction.options.getRole('helper-role', true);
			
			const client = (await import('../../index')).default;
			const guild = client.guilds.cache.get(process.env.GUILD_ID!) 
				?? await client.guilds.fetch(process.env.GUILD_ID!);
			if (!guild) throw new Error('Guild not found');

			const queueChannel = await guild.channels.create({
				name: `queue`,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: [
					{
						id: guild.roles.everyone,
						deny: [PermissionFlagsBits.SendMessages],
					}
				]
			});

			const resultsChannel = await guild.channels.create({
				name: `queue-results`,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: [
					{
						id: guild.roles.everyone,
						deny: [PermissionFlagsBits.SendMessages],
					}
				]
			});

			// Yes I know I should just use null directly here for the msg id I'll fix it tomorrow - jeff at midnight
			await pool.query(`
                INSERT INTO settings
				(helper_role_id, queue_message_id, queue_channel_id, queue_results_channel_id, queue_category_id)
				VALUES ($1,$2,$3,$4,$5)
                `, [helperRole.id, 'null', queueChannel.id, resultsChannel.id, category.id]
			);

			await updateQueueMessage(queueChannel);

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			await interaction.deleteReply();
		} catch (err: any) {
			console.error(err);
			const errorMsg = err.detail || err.message || 'Unknown';
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content: `Failed to setup bot in database. Reason: ${errorMsg}` });
			} else {
				await interaction.reply({ content: `Failed to setup bot in database. Reason: ${errorMsg}`, flags: MessageFlags.Ephemeral });
			}
		}
	},
};

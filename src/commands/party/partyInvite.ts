import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, TextChannel, ButtonBuilder, ActionRowBuilder, ButtonStyle  } from 'discord.js';
import { pool } from '../../db';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('party-invite')
		.setDescription('Invites users to your party')
    	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
			option.setName('member')
				.setDescription('Category where the new channels will be created for this queue')
				.setRequired(true)),
	async execute(interaction: ChatInputCommandInteraction) {

		try {
            const member = interaction.options.getUser('member', true);

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const acceptButton = new ButtonBuilder()
                .setCustomId(`accept-party-invite-${interaction.user.id}`)
                .setLabel('Accept Invite')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(acceptButton);

            // TODO: make sure user was created

            await pool.query(`
                UPDATE users
                SET joined_party_id = $1
                WHERE user_id = $1
                `, [interaction.user.id]);

			try {
                await member.send({
                    content: `You have been invited to join **${interaction.user.displayName}**'s party.`,
                    components: [row],
                });
                await interaction.editReply({ content: `Invite sent to ${member.username}.` });
            } catch (err) {
                await interaction.editReply({ content: `Failed to send invite to ${member.username}. They may have DMs disabled.` });
            }
		} catch (err: any) {
			console.error(err);
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content: `Failed to invite player.` });
			} else {
				await interaction.reply({ content: `Failed to invite player.`, flags: MessageFlags.Ephemeral });
			}
		}
	},
};

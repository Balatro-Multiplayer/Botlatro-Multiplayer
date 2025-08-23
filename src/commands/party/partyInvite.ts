import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle  } from 'discord.js';
import { pool } from '../../db';
import { partyUtils } from '../../utils/queryDB';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('party-invite')
		.setDescription('Invites users to your party')
        .addUserOption(option =>
			option.setName('member')
				.setDescription('The member you would like to invite to your party')
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

            // TODO: make sure user has an entry in DB
            // TODO: add user to party when they accept invite


            // if user isn't already in a party, create a new party and add them
            const partyId = await partyUtils.getUserParty(interaction.user.id);
            if (!partyId) {
                await partyUtils.createParty(`${interaction.user.username}'s Party`, interaction.user.id);
            }


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

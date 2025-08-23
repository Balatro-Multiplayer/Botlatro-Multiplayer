import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle  } from 'discord.js';
import { pool } from '../../db';
import { partyUtils } from '../../utils/queryDB';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('party-leave')
		.setDescription('Leave your current party'),

	async execute(interaction: ChatInputCommandInteraction) {

		try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const userId = interaction.user.id;
            const partyId = await partyUtils.getUserParty(userId);
            if (!partyId) {
                await interaction.editReply({ content: `You are not currently in a party.` });
                return;
            }
            await partyUtils.removeUserFromParty(userId); // handles deleting party if empty
            await interaction.editReply({ content: `You have left the party.` });

        } catch (err: any) {
            console.error(err);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `Failed to leave party.` });
            } else {
                await interaction.reply({ content: `Failed to leave party.`, flags: MessageFlags.Ephemeral });
            }
        }
    }
};
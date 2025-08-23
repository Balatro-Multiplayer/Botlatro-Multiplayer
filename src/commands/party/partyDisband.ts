import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle  } from 'discord.js';
import { pool } from '../../db';
import { partyUtils } from '../../utils/queryDB';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('party-disband')
		.setDescription('Disband your current party'),

	async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
            const userId = interaction.user.id;
            const partyId = await partyUtils.getUserParty(userId);

            if (!await partyUtils.isLeader(userId)) {
                await interaction.editReply({ content: `Only the party leader can disband the party.` });
                return;
            } 
            
            if (!partyId) {
                await interaction.editReply({ content: `You are not currently in a party.` });
                return;
            }

            await partyUtils.deleteParty(partyId);
            await interaction.editReply({ content: `Your party has been disbanded.` });

        } catch (err: any) {
            console.error(err); 
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `Failed to disband party.` });
            } else {
                await interaction.reply({ content: `Failed to disband party.`, flags: MessageFlags.Ephemeral });
            }
        }
    }
}
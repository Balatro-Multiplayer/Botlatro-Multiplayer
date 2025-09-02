import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, AutocompleteInteraction } from 'discord.js';
import { getUsersInMatch, getMatchIdFromChannel, getUserTeam } from '../../utils/queryDB';
import { pool } from '../../db';
import { endMatch } from '../../utils/matchHelpers';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('choose-winner')
		.setDescription('Manually choose a winner for current match')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
			option.setName('user')
				.setDescription('The user to give the win to')
				.setRequired(true)
                .setAutocomplete(true) 
        ),
	async execute(interaction: ChatInputCommandInteraction) {
        try {
            const matchId = await getMatchIdFromChannel(interaction.channelId)
            const userId = interaction.options.getString('user', true)
            if (!matchId) {
                await interaction.reply({ content: 'No active match found in this channel.', flags: MessageFlags.Ephemeral });
                return;
            }
            const winningTeam = await getUserTeam(userId, matchId)
            await pool.query('UPDATE matches SET winning_team = $1 WHERE id = $2', 
                [winningTeam, matchId]
            );
            await interaction.reply(`Assigned win to <@${interaction.options.getString('user', true)}>.`);
            await endMatch(matchId)
        } catch (err: any) {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `Failed to assign win. Reason: ${err}` });
            } else {
                interaction.reply({ content: `Failed to assign win. Reason: ${err}`, flags: MessageFlags.Ephemeral });
            }
            console.error(err);
        }
    },

    async autocomplete(interaction: AutocompleteInteraction) {
        const currentValue = interaction.options.getFocused()
        const matchId = await getMatchIdFromChannel(interaction.channelId)
        if (!matchId) {
            await interaction.respond([]);
            return;
        }
        const usersIdInMatch = await getUsersInMatch(matchId)
        const users = await Promise.all(
            usersIdInMatch.map(async userId => {
                const user = await interaction.client.users.fetch(userId);
                return {
                    name: user.username,
                    value: userId
                };
            })
        );
        const filtered = users.filter(user =>
            user.name.toLowerCase().includes(currentValue.toLowerCase())
        );
        await interaction.respond(filtered.slice(0, 25));
    }
};
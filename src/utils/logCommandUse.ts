import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, AutocompleteInteraction, EmbedBuilder } from 'discord.js';
import { closeMatch, getQueueNames, getSettings, updatePlayerElo } from './queryDB';
import { pool } from '../db';

export async function logCommandUse(interaction: ChatInputCommandInteraction) {
    try {
        const settings = await getSettings();
        if (!settings || !settings.logs_channel_id) {
            console.warn('Logs channel ID not set in settings.');
            return;
        }

        const client = (await import('../index')).default;
        const guild = client.guilds.cache.get(process.env.GUILD_ID!) 
            ?? await client.guilds.fetch(process.env.GUILD_ID!);
        if (!guild) { throw new Error('Guild not found.'); return }

        const logsChannel = guild.channels.cache.get(settings.logs_channel_id);
        if (!logsChannel || !logsChannel.isTextBased()) {
            console.error('Logs channel not found.');
            return;
        }

        const commandName = interaction.commandName;
        const commandParameters = interaction.options.data.map(option => {
            return `${option.name}: "${option.value}"`;
        }).join('}, {').slice(0, -1);



        const blameEmbed = new EmbedBuilder()
            .setTitle(`${commandName} {${commandParameters}`)
            .addFields(
                { name: 'Command', value: commandName, inline: true },
                { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                { name: 'Channel', value: `${interaction.channel?.toString() || 'DM'}`, inline: true },
            )
            .setTimestamp()
            .setColor(0x00AE86);

    } catch (err) {
        console.error('Failed to log command usage:', err);
    }

}
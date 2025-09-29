import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { getMatchIdFromChannel } from '../../utils/queryDB'
import { setupMatchVoiceChannel } from '../../utils/matchHelpers'

export default {
  data: new SlashCommandBuilder()
    .setName('setup-match-vc')
    .setDescription('Setup a match voice channel'),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()
      const matchId =
        (await getMatchIdFromChannel(interaction.channel!.id)) ?? null

      if (!matchId) {
        return interaction.editReply({
          content: 'A match is not setup in this channel.',
        })
      }

      await setupMatchVoiceChannel(interaction, matchId)
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to setup match voice channel. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to setup match voice channel. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

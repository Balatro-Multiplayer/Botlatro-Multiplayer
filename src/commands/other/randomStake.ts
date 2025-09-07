import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { getRandomStake } from '../../utils/matchHelpers'

module.exports = {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const stakeChoice = getRandomStake()
      const stakeStr = `${stakeChoice.stake_emote} ${stakeChoice.stake_name}`
      interaction.reply({ content: stakeStr })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to send message. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to send message. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

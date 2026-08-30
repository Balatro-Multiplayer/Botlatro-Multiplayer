import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { getRandomStake } from '../../utils/matchHelpers'
import {
  getMatchData,
  getMatchIdFromChannel,
  setPickedMatchStake,
} from '../../utils/queryDB'
import { isHomeGuild } from '../../utils/installContext'
import { getStakeAppEmote } from '../../utils/combinedEmoteCache'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const customStake =
        interaction.options.getString('custom-stake', false) ?? false
      const custom = customStake == 'yes'
      const stakeChoice = await getRandomStake(custom)

      // Foreign (user-installed) context: strictly read-only. Roll and reply
      // without touching any match state. Prefer the application emote (renders
      // in any server), falling back to the guild emote if none is uploaded.
      if (!isHomeGuild(interaction)) {
        const emote = getStakeAppEmote(stakeChoice) ?? stakeChoice.stake_emote
        await interaction.reply({
          content: `${emote} ${stakeChoice.stake_name}`,
        })
        return
      }

      const matchId = await getMatchIdFromChannel(interaction.channelId)

      if (matchId) {
        // In a match channel
        const matchData = await getMatchData(matchId)

        if (!matchData.stake_vote_ended)
          await setPickedMatchStake(matchId, stakeChoice.stake_name)
      }

      const stakeStr = `${stakeChoice.stake_emote} ${stakeChoice.stake_name}`
      await interaction.reply({ content: stakeStr })
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

import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { getRandomStake } from '../../utils/matchHelpers'
import {
  getMatchData,
  getMatchIdFromChannel,
  getStakeList,
  setPickedMatchStake,
} from '../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const matchId = await getMatchIdFromChannel(interaction.channelId)

      if (matchId) {
        // In a match channel
        const stakeList = await getStakeList()
        const randomStake =
          stakeList[Math.floor(Math.random() * stakeList.length)]
        const matchData = await getMatchData(matchId)

        if (!matchData.stake_vote_ended)
          await setPickedMatchStake(matchId, randomStake.stake_name)

        const stakeStr = `${randomStake.stake_emote} ${randomStake.stake_name}`
        await interaction.reply({ content: stakeStr })
      } else {
        // Not in a match channel - use normal logic
        const stakeChoice = await getRandomStake()
        const stakeStr = `${stakeChoice.stake_emote} ${stakeChoice.stake_name}`
        await interaction.reply({ content: stakeStr })
      }
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

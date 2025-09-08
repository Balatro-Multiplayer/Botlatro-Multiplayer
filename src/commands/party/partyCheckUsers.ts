import {
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { partyUtils } from '../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      const userId = interaction.user.id
      const partyId = await partyUtils.getUserParty(userId)

      if (!partyId) {
        await interaction.editReply({
          content: `You are not currently in a party.`,
        })
        return
      }

      const includeNames = true
      const partyMembers = await partyUtils.getPartyUserList(
        partyId,
        includeNames,
      )
      if (!partyMembers || partyMembers.length === 0) {
        await interaction.editReply({
          content: `Your party apparently has no members, hmm... (please report this bug)`,
        })
        return
      }

      const partyName = (await partyUtils.getPartyName(partyId)) || 'Party'
      const memberList = await Promise.all(
        partyMembers.map(async (member) => {
          const isLeader = await partyUtils.isLeader(member.id)
          let displayTag: string = ''
          if (isLeader) {
            displayTag = ' (leader)'
          }
          const memberString = `- ${member.name}${displayTag}`
          return memberString
        }),
      )

      await interaction.editReply({
        content: `${partyName}: \n${memberList.join('\n')}`,
      })
    } catch (err: any) {
      console.error(err)
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to list party members.`,
        })
      } else {
        await interaction.reply({
          content: `Failed to list party members.`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

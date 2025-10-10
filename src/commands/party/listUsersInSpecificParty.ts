import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { partyUtils } from '../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      const partyId = interaction.options.getString('party-to-check', true)
      const partyMembers = await partyUtils.getPartyUserList(partyId, true)
      const partyName = (await partyUtils.getPartyName(partyId)) || partyId

      if (!partyMembers || partyMembers.length === 0) {
        await interaction.editReply({
          content: `The party "${partyName}" has no members. Deleting party now`,
        })
        await partyUtils.deleteParty(partyId)
        return
      }

      const memberList = await Promise.all(
        partyMembers.map(async (member) => {
          const isLeader = await partyUtils.isLeader(member.id)
          let displayTag: string = ''
          if (isLeader) {
            displayTag = ' (leader)'
          }

          return `- ${member.name}${displayTag}`
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

  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused()

    const parties = await partyUtils.listAllParties()
    const filtered = parties.filter((party) =>
      party.name.toLowerCase().includes(focusedValue.toLowerCase()),
    )
    const choices = filtered
      .slice(0, 25)
      .map((party) => ({ name: party.name, value: party.id.toString() }))
    await interaction.respond(choices)
  },
}

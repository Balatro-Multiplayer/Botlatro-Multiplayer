import {
  ChatInputCommandInteraction,
  MessageFlags,
  AutocompleteInteraction,
} from 'discord.js'
import { partyUtils } from '../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      const userId = interaction.options.getString('user')

      if (!userId) {
        await interaction.editReply({
          content: `You must specify a user to remove from the party.`,
        })
        return
      }

      if (!(await partyUtils.isLeader(interaction.user.id))) {
        await interaction.editReply({
          content: `Only the party leader can remove members from the party.`,
        })
        return
      }

      await partyUtils.removeUserFromParty(userId)
      await interaction.editReply({
        content: `User <@${userId}> removed from party.`,
      })
    } catch (err: any) {
      console.error(err)
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to remove user from party.`,
        })
      } else {
        await interaction.reply({
          content: `Failed to remove user from party.`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      const focusedValue = interaction.options.getFocused()

      const userId = interaction.user.id
      const partyId = await partyUtils.getUserParty(userId)
      if (!partyId) {
        await interaction.respond([])
        return
      }
      const users = await partyUtils.getPartyUserList(partyId, true)
      if (!users || users.length === 0) {
        await interaction.respond([])
        return
      }
      const filtered = users.filter(
        (user) =>
          user.name.toLowerCase().includes(focusedValue.toLowerCase()) &&
          user.id !== userId,
      )
      const choices = filtered
        .slice(0, 25)
        .map((user) => ({ name: user.name, value: user.id.toString() }))
      await interaction.respond(choices)
    } catch (err: any) {
      console.error(err)
      await interaction.respond([])
    }
  },
}

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

      if (!(await partyUtils.isLeader(userId))) {
        await interaction.editReply({
          content: `Only the party leader can disband the party.`,
        })
        return
      }

      if (!partyId) {
        await interaction.editReply({
          content: `You are not currently in a party.`,
        })
        return
      }

      await partyUtils.deleteParty(partyId)
      await interaction.editReply({ content: `Your party has been disbanded.` })
    } catch (err: any) {
      console.error(err)
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Failed to disband party.` })
      } else {
        await interaction.reply({
          content: `Failed to disband party.`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

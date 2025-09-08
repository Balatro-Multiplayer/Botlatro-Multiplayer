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
      const partyName =
        interaction.options.getString('party-name') ||
        `${interaction.user.username}'s Party`
      const partyId = await partyUtils.getUserParty(userId)

      if (partyId) {
        await interaction.editReply({
          content: `You are already in a party. Leave your current party before creating a new one.`,
        })
        return
      }

      await partyUtils.createParty(partyName, userId)
      await interaction.editReply({ content: `${partyName} created.` })
    } catch (err: any) {
      console.error(err)
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Failed to create party.` })
      } else {
        await interaction.reply({
          content: `Failed to create party.`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

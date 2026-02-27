import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { getBountyByName, deleteBounty } from '../../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const bountyName = interaction.options.getString('bounty-name', true)
      const bounty = await getBountyByName(bountyName)

      if (!bounty) {
        await interaction.reply({
          content: `Bounty **${bountyName}** not found.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      await deleteBounty(bounty.id)

      await interaction.reply({
        content: `Bounty **${bountyName}** has been deleted.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error('Error deleting bounty:', err)
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Failed to delete bounty: ${err.message || 'Unknown error'}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to delete bounty: ${err.message || 'Unknown error'}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

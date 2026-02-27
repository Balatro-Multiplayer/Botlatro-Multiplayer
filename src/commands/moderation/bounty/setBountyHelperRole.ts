import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { setBountyHelperRoleId } from '../../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const role = interaction.options.getRole('role', true)
      await setBountyHelperRoleId(role.id)

      await interaction.reply({
        content: `Bounty helper role set to <@&${role.id}>.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error('Error setting bounty helper role:', err)
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Failed to set bounty helper role: ${err.message || 'Unknown error'}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to set bounty helper role: ${err.message || 'Unknown error'}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

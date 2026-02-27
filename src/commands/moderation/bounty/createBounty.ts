import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { createBounty } from '../../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const name = interaction.options.getString('name', true)
      const description = interaction.options.getString('description', true)

      const bounty = await createBounty(name, description, interaction.user.id)

      await interaction.reply({
        content: `Bounty **${bounty.bounty_name}** has been created!`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error('Error creating bounty:', err)
      const errorMsg =
        err.constraint === 'bounties_bounty_name_unique'
          ? 'A bounty with that name already exists.'
          : err.message || 'Unknown error'
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Failed to create bounty: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to create bounty: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

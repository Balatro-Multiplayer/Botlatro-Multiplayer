import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { getUserBounties } from '../../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const user = interaction.options.getUser('user', true)
      const userBounties = await getUserBounties(user.id)

      if (userBounties.length === 0) {
        await interaction.reply({
          content: `<@${user.id}> has no bounties.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const lines = userBounties.map((ub) => {
        const firstLabel = ub.is_first ? ' ⭐' : ''
        return `**${ub.bounty_name}**${firstLabel} — completed <t:${Math.floor(new Date(ub.completed_at).getTime() / 1000)}:R>`
      })

      await interaction.reply({
        content: `**Bounties for <@${user.id}>:**\n${lines.join('\n')}`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error('Error checking bounties:', err)
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Failed to check bounties: ${err.message || 'Unknown error'}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to check bounties: ${err.message || 'Unknown error'}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

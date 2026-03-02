import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import {
  getBountyByName,
  getBountyCompletions,
} from '../../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const bountyName = interaction.options.getString('bounty-name', true)
      const bounty = await getBountyByName(bountyName)

      if (!bounty) {
        await interaction.reply({
          content: `No bounty named **${bountyName}** exists.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const completions = await getBountyCompletions(bounty.id)

      if (completions.length === 0) {
        await interaction.reply({
          content: `No one has completed **${bounty.bounty_name}** yet.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const lines = completions.map((c) => {
        const firstLabel = c.is_first ? ' ⭐' : ''
        return `<@${c.user_id}>${firstLabel} — completed <t:${Math.floor(new Date(c.completed_at).getTime() / 1000)}:R>`
      })

      await interaction.reply({
        content: `**Completions for ${bounty.bounty_name}** (${completions.length}):\n${lines.join('\n')}`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error('Error fetching bounty completions:', err)
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Failed to fetch completions: ${err.message || 'Unknown error'}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to fetch completions: ${err.message || 'Unknown error'}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

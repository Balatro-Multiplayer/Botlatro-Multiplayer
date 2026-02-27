import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js'
import {
  getBounties,
  getBountyCompletions,
  getBountyHelperRoleId,
} from '../../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const member = interaction.member as GuildMember
      const bountyHelperRoleId = await getBountyHelperRoleId()
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator)
      const hasBountyRole =
        bountyHelperRoleId && member.roles.cache.has(bountyHelperRoleId)

      if (!isAdmin && !hasBountyRole) {
        await interaction.reply({
          content: 'You do not have permission to list bounties.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const bounties = await getBounties()

      if (bounties.length === 0) {
        await interaction.reply({
          content: 'No bounties exist yet.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const lines: string[] = []
      for (const bounty of bounties) {
        const completions = await getBountyCompletions(bounty.id)
        lines.push(
          `**${bounty.bounty_name}** — ${bounty.description} (${completions.length} completion${completions.length !== 1 ? 's' : ''})`,
        )
      }

      await interaction.reply({
        content: `**All Bounties:**\n${lines.join('\n')}`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error('Error listing bounties:', err)
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Failed to list bounties: ${err.message || 'Unknown error'}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to list bounties: ${err.message || 'Unknown error'}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

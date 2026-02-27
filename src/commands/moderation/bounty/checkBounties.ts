import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js'
import { getUserBounties, getBountyHelperRoleId } from '../../../utils/queryDB'

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
          content: 'You do not have permission to check bounties.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

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

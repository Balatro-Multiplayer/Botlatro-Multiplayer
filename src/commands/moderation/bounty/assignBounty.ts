import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js'
import {
  getBountyByName,
  assignBounty,
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
          content: 'You do not have permission to assign bounties.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const bountyName = interaction.options.getString('bounty-name', true)
      const user = interaction.options.getUser('user', true)

      const bounty = await getBountyByName(bountyName)
      if (!bounty) {
        await interaction.reply({
          content: `Bounty **${bountyName}** not found.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const userBounty = await assignBounty(bounty.id, user.id)

      const firstLabel = userBounty.is_first ? ' (First to complete!)' : ''
      await interaction.reply({
        content: `Bounty **${bountyName}** assigned to <@${user.id}>.${firstLabel}`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error('Error assigning bounty:', err)
      const errorMsg =
        err.constraint === 'user_bounties_bounty_user_unique'
          ? 'This user already has this bounty.'
          : err.message || 'Unknown error'
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Failed to assign bounty: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to assign bounty: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

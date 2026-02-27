import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js'
import {
  getBountyByName,
  revokeBounty,
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
          content: 'You do not have permission to revoke bounties.',
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

      const revoked = await revokeBounty(bounty.id, user.id)

      if (!revoked) {
        await interaction.reply({
          content: `<@${user.id}> does not have bounty **${bountyName}**.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      await interaction.reply({
        content: `Bounty **${bountyName}** revoked from <@${user.id}>.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error('Error revoking bounty:', err)
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Failed to revoke bounty: ${err.message || 'Unknown error'}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to revoke bounty: ${err.message || 'Unknown error'}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

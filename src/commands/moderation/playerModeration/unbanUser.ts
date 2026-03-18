import { ChatInputCommandInteraction } from 'discord.js'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { RemoveBanError } from '../../../command-handlers/moderation/removeBan'
import { getGuildDisplayName } from './moderationLogUtils'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()
      const user = interaction.options.getString('user', true)
      const reason = interaction.options.getString('reason', true).trim()
      const moderatorName = await getGuildDisplayName(
        interaction.guild,
        interaction.user.id,
        interaction.user.username,
      )

      let member = null
      try {
        member = await interaction.guild?.members.fetch(user)
      } catch {}
      const username = member?.displayName ?? user

      await COMMAND_HANDLERS.MODERATION.REMOVE_BAN({
        userId: user,
        blame: moderatorName,
        reason,
      })

      await interaction.editReply(
        `User ${member?.user ?? username} unbanned - reason: ${reason}`,
      )
    } catch (err: any) {
      console.error(err)
      if (err instanceof RemoveBanError) {
        const user = interaction.options.getString('user', true)
        let member = null
        try {
          member = await interaction.guild?.members.fetch(user)
        } catch {}
        const username = member?.displayName ?? user
        await interaction.editReply(
          `User ${username} can not be found with a valid ban to remove.`,
        )
        return
      }
      await interaction.editReply('Failed to remove ban.')
    }
  },
}

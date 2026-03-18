import { ChatInputCommandInteraction } from 'discord.js'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { UpdateBanError } from '../../../command-handlers/moderation/updateBan'
import { formatDiscordDate, getGuildDisplayName } from './moderationLogUtils'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.options.getString('user', true)

    try {
      await interaction.deferReply()

      const nextReason = interaction.options.getString('reason', false)
      const nextLength = interaction.options.getNumber('length', false)

      let member = null
      try {
        member = await interaction.guild?.members.fetch(userId)
      } catch {}
      const username = member?.displayName ?? userId

      const moderatorName = await getGuildDisplayName(
        interaction.guild,
        interaction.user.id,
        interaction.user.username,
      )
      const { updatedBan } = await COMMAND_HANDLERS.MODERATION.UPDATE_BAN({
        userId,
        blame: moderatorName,
        length: nextLength,
        reason: nextReason,
      })

      await interaction.editReply(
        `Updated ban for ${member?.user ?? username}. Expires ${formatDiscordDate(updatedBan.expires_at)}. Reason: ${updatedBan.reason}`,
      )
    } catch (err: any) {
      console.error(err)
      if (err instanceof UpdateBanError) {
        if (err.code === 'NO_FIELDS') {
          await interaction.editReply(err.message)
          return
        }

        if (err.code === 'NOT_FOUND') {
          let member = null
          try {
            member = await interaction.guild?.members.fetch(userId)
          } catch {}
          const username = member?.displayName ?? userId
          await interaction.editReply(
            `User ${username} can not be found with a valid ban to update.`,
          )
          return
        }
      }
      await interaction.editReply('Failed to update ban.')
    }
  },
}

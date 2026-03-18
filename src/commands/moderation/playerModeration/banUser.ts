import { ChatInputCommandInteraction } from 'discord.js'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { CreateBanError } from '../../../command-handlers/moderation/createBan'
import { formatDiscordDate, getGuildDisplayName } from './moderationLogUtils'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user', true)

    try {
      await interaction.deferReply()
      const reason = interaction.options.getString('reason', true).trim()
      const timespan = interaction.options.getNumber('length', true)
      const moderatorName = await getGuildDisplayName(
        interaction.guild,
        interaction.user.id,
        interaction.user.username,
      )

      await COMMAND_HANDLERS.MODERATION.CREATE_BAN({
        userId: user.id,
        blame: moderatorName,
        length: timespan,
        reason,
      })

      await interaction.editReply(
        timespan === 0
          ? `User ${user} permanently banned - reason: ${reason}`
          : `User ${user} banned for ${timespan} days - reason: ${reason}`,
      )
    } catch (err: any) {
      console.error(err)
      if (err instanceof CreateBanError) {
        const expiryText = err.expiresAt
          ? ` until ${formatDiscordDate(err.expiresAt)}`
          : ''
        await interaction.editReply(`User ${user} already banned${expiryText}.`)
        return
      }
      await interaction.editReply('Failed to ban user.')
    }
  },
}

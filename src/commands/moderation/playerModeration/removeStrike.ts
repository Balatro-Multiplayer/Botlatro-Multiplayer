import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { RemoveStrikeError } from '../../../command-handlers/moderation/removeStrike'
import { getGuildDisplayName } from './moderationLogUtils'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const strikeId = interaction.options.getString('strike', true)
      const reason = interaction.options.getString('reason', false)
      const blame = await getGuildDisplayName(
        interaction.guild,
        interaction.user.id,
        interaction.user.username,
      )

      const { strike, removalReason } =
        await COMMAND_HANDLERS.MODERATION.REMOVE_STRIKE({
          strikeId,
          blame,
          reason,
        })

      const removalReasonText = removalReason
        ? ` Removal reason: ${removalReason}`
        : ''

      await interaction.editReply({
        content: `Removed strike #${strikeId} (${strike.amount}). Original reason: ${strike.reason}.${removalReasonText}`,
      })
    } catch (err: any) {
      console.error(err)

      if (err instanceof RemoveStrikeError) {
        await interaction.editReply({
          content: `strike with id ${interaction.options.getString('strike', true)} not found`,
        })
        return
      }

      await interaction.editReply({
        content: 'Failed to remove strike.',
      })
    }
  },
}

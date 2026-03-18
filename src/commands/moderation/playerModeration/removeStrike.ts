import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { RemoveStrikeError } from '../../../command-handlers/moderation/removeStrike'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const strikeId = interaction.options.getString('strike', true)
      const reason = interaction.options.getString('reason', false)

      const { message } = await COMMAND_HANDLERS.MODERATION.REMOVE_STRIKE({
        strikeId,
        removedById: interaction.user.id,
        reason,
      })

      await interaction.editReply({
        content: message,
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

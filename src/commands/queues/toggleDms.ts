import {
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import {
  toggleUserDms,
} from '../../utils/queryDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const toggleState = await toggleUserDms(interaction.user.id);

      return interaction.editReply({
        content: `Set the bot to ${toggleState ? 'DM you when getting a match' : 'NOT DM you at all.' }`,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to toggle bot DMs. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to set toggle bot DMs. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

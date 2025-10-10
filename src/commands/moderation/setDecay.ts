import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { setDecayValues } from '../../utils/queryDB'

export default {
  async execute(
    interaction: ChatInputCommandInteraction,
    lock: boolean = true,
  ) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const threshold = interaction.options.getNumber('decay-threshold')!
      const amount = interaction.options.getNumber('decay-amount')!
      const interval = interaction.options.getNumber('decay-interval')!
      const grace = interaction.options.getNumber('grace-period') || 24 * 7 // 1 week default grace
      await setDecayValues({ threshold, amount, interval, grace })
      await interaction.editReply({ content: 'decay values set' })
    } catch (err: any) {
      console.error(err)
    }
  },
}

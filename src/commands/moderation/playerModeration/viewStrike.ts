import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const discordChannel = interaction.channel
      const user = interaction.options.getUser('user', true)
      const amount = interaction.options.getInteger('amount', true)
      const reason =
        interaction.options.getString('reason', false) || 'No reason provided'
      const reference =
        interaction.options.getString('reference channel', false) ||
        discordChannel ||
        'No reference provided'
    } catch (err: any) {
      console.error(err)
    }
  },
}

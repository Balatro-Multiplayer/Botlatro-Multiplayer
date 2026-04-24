import { ChatInputCommandInteraction } from 'discord.js'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { getGuildDisplayName } from './moderationLogUtils'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()

      const user = interaction.options.getUser('user', true)
      const amount = interaction.options.getInteger('strikes', true)
      const reason = interaction.options.getString('reason', true).trim()
      const reference =
        interaction.options.getChannel('reference', false) ||
        interaction.channel
      const referenceName =
        reference && 'name' in reference
          ? (reference.name ?? 'No reference provided')
          : 'No reference provided'
      const blame = await getGuildDisplayName(
        interaction.guild,
        interaction.user.id,
        interaction.user.username,
      )

      const { finalAmount, totalStrikes } =
        await COMMAND_HANDLERS.MODERATION.CREATE_STRIKE({
          userId: user.id,
          issuedById: interaction.user.id,
          blame,
          amount,
          reason,
          reference: referenceName,
        })

      await interaction.editReply(
        `User ${user.username} given ${finalAmount} strikes for ${reason} (total: ${totalStrikes})`,
      )
      if (finalAmount >= 4) {
        await interaction.followUp({
          content:
            'Please apply the tournament blacklist role to this user, will automate this soon',
          ephemeral: true,
        })
      }
    } catch (err: any) {
      console.error(err)
      await interaction.editReply('Failed to give strike.')
    }
  },
}

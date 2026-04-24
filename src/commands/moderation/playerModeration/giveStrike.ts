import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
} from 'discord.js'
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

      const strikeMessage = `User ${user.username} given ${finalAmount} strikes for ${reason} (total: ${totalStrikes})`

      if (totalStrikes < 3) {
        await interaction.editReply(strikeMessage)
        return
      }

      const strikeBanLength: Record<number, number> = {
        3: 1,
        4: 3,
        5: 7,
        6: 14,
        7: 30,
        8: 9999,
      }
      const banLength = strikeBanLength[totalStrikes] ?? null
      const banLengthLabel =
        banLength === null
          ? 'permanent'
          : `${banLength} day${banLength === 1 ? '' : 's'}`

      const banButton = new ButtonBuilder()
        .setCustomId('apply_ban')
        .setLabel(`Apply ${banLengthLabel} ban to this user`)
        .setStyle(ButtonStyle.Danger)

      const dismissButton = new ButtonBuilder()
        .setCustomId('dismiss_ban')
        .setLabel('No')
        .setStyle(ButtonStyle.Secondary)

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        banButton,
        dismissButton,
      )

      const reply = await interaction.editReply({
        content: `${strikeMessage}\n\nWould you like to apply a ${banLengthLabel} ban to this user?`,
        components: [row],
      })

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 30000, // 30 seconds
        max: 1,
      })

      collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.customId === 'apply_ban') {
          await buttonInteraction.update({
            content: `${strikeMessage}\n\n${banLengthLabel} ban applied to ${user.username}.`,
            components: [],
          })
          await COMMAND_HANDLERS.MODERATION.CREATE_BAN({
            userId: user.id,
            blame,
            reason,
            length: banLength,
          })
        } else {
          await buttonInteraction.update({
            content: strikeMessage,
            components: [],
          })
        }
      })

      collector.on('end', async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: strikeMessage,
            components: [],
          })
        }
      })
    } catch (err: any) {
      console.error(err)
      await interaction.editReply('Failed to give strike.')
    }
  },
}

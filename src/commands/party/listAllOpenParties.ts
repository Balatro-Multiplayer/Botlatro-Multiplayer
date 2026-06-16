import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { partyUtils } from '../../utils/queryDB'
import { sendPaginatedEmbed } from '../../utils/paginatedEmbed'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      const parties = await partyUtils.listAllParties()

      await sendPaginatedEmbed(interaction, {
        title: 'All Parties',
        summary: `Total: ${parties?.length ?? 0}`,
        emptyState: 'There are currently no parties.',
        entries: (parties ?? []).map(
          (party) => `- ${party.name} (ID: ${party.id})`,
        ),
      })
    } catch (err: any) {
      console.error(err)
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Failed to list parties.` })
      } else {
        await interaction.reply({
          content: `Failed to list parties.`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} from 'discord.js'
import { pool } from '../../db'
import { partyUtils } from '../../utils/queryDB'

module.exports = {
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      const parties = await partyUtils.listAllParties()
      if (!parties || parties.length === 0) {
        await interaction.editReply({
          content: `There are currently no parties.`,
        })
        return
      }

      const partyList = parties.map((party) => {
        return `- ${party.name} (ID: ${party.id})`
      })
      await interaction.editReply({
        content: `All Parties: \n${partyList.join('\n')}`,
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

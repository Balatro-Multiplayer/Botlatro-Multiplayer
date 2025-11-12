import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { getCopyPasteByName, searchCopyPastesByName } from '../../utils/queryDB'

export default {
  data: new SlashCommandBuilder()
    .setName('paste')
    .setDescription('Post a copy-paste to the channel')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of the copy-paste to post')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const name = interaction.options.getString('name', true).toLowerCase()

      const paste = await getCopyPasteByName(name)

      if (!paste) {
        return await interaction.reply({
          content: `Copy-paste **${name}** not found!`,
          flags: MessageFlags.Ephemeral,
        })
      }

      await interaction.reply({ content: paste.content })
    } catch (err: any) {
      console.error('Error in paste command:', err)
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Failed: ${err.message || err.detail || 'Unknown'}`,
        })
      } else {
        await interaction.reply({
          content: `Failed: ${err.message || err.detail || 'Unknown'}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase()
      const pastes = await searchCopyPastesByName(focusedValue)

      await interaction.respond(
        pastes.map((paste) => ({
          name: paste.name,
          value: paste.name,
        })),
      )
    } catch (err) {
      console.error('Error in paste autocomplete:', err)
      await interaction.respond([])
    }
  },
}

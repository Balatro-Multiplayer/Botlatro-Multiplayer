import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import {
  getAllCopyPastes,
  upsertCopyPaste,
  deleteCopyPaste as dbDeleteCopyPaste,
  searchCopyPastesByName,
} from '../../utils/queryDB'

export default {
  data: new SlashCommandBuilder()
    .setName('copypaste')
    .setDescription('[HELPER] Manage copy-pastes')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Create or update a copy-paste')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Name of the copy-paste')
            .setRequired(true)
            .setMaxLength(255),
        )
        .addStringOption((option) =>
          option
            .setName('content')
            .setDescription('Content of the copy-paste')
            .setRequired(true)
            .setMaxLength(2000),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a copy-paste')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Name of the copy-paste to delete')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )

    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List all available copy-pastes'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand()

    try {
      if (subcommand === 'set') {
        const name = interaction.options.getString('name', true).toLowerCase()
        const content = interaction.options.getString('content', true)

        await upsertCopyPaste(name, content, interaction.user.id)

        await interaction.reply({
          content: `Copy-paste **${name}** has been created/updated!`,
          flags: MessageFlags.Ephemeral,
        })
      } else if (subcommand === 'delete') {
        const name = interaction.options.getString('name', true).toLowerCase()

        const deleted = await dbDeleteCopyPaste(name)

        if (deleted) {
          await interaction.reply({
            content: `Copy-paste **${name}** has been deleted!`,
            flags: MessageFlags.Ephemeral,
          })
        } else {
          await interaction.reply({
            content: `Copy-paste **${name}** not found!`,
            flags: MessageFlags.Ephemeral,
          })
        }
      } else if (subcommand === 'list') {
        const pastes = await getAllCopyPastes()

        if (pastes.length === 0) {
          return await interaction.reply({
            content: 'No copy-pastes found!',
            flags: MessageFlags.Ephemeral,
          })
        }

        const list = pastes.map((p) => `• **${p.name}**`).join('\n')

        await interaction.reply({
          content: `**Available copy-pastes:**\n${list}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    } catch (err: any) {
      console.error('Error in copypaste command:', err)
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
      console.error('Error in copypaste autocomplete:', err)
      await interaction.respond([])
    }
  },
}

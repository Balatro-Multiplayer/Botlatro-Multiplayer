import {
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js'
import { BACKGROUNDS, getBackgroundById } from '../../utils/backgroundManager'
import { pool } from '../../db'
import { Canvas } from 'skia-canvas'
import path from 'path'
import { loadImage } from 'skia-canvas'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Create select menu with all backgrounds
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('stats-background-select')
        .setPlaceholder('Choose background for your stats card!')
        .addOptions(
          BACKGROUNDS.map((bg) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(bg.name)
              .setValue(bg.id)
              .setDescription(`Set ${bg.name} as your stats background`),
          ),
        )

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        selectMenu,
      )

      await interaction.reply({
        content: 'Select a background for your stats card:',
        components: [row],
        flags: MessageFlags.Ephemeral,
      })
    } catch (error: any) {
      console.error('Error showing background selector:', error)
      await interaction.reply({
        content: `Failed to show background selector: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}

// Helper function to generate a preview of the background
export async function generateBackgroundPreview(
  backgroundFilename: string,
): Promise<AttachmentBuilder> {
  const scale = 2
  const width = 800
  const height = 600

  const canvas = new Canvas(width * scale, height * scale)
  const ctx = canvas.getContext('2d')

  ctx.scale(scale, scale)
  ctx.imageSmoothingEnabled = false

  // Draw background
  const bg = await loadImage(
    path.join(__dirname, '../../assets/backgrounds', backgroundFilename),
  )
  ctx.drawImage(bg, 0, 0)

  const buffer = await canvas.toBuffer('png', { quality: 1.0, density: scale })
  return new AttachmentBuilder(buffer, { name: 'preview.png' })
}

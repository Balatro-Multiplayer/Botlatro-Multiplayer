import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js'
import { addReserveChannel } from '../../utils/queryDB'
import { pool } from '../../db'

const MAX_PER_CATEGORY = 45
const OVERFLOW_CATEGORY_IDS = ['1427367817803464914', '1477060454516789509'] // lfg2, lfg3

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    const count = interaction.options.getInteger('count', false) ?? 25

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const guild = interaction.guild!
    const settings = await pool.query(
      `SELECT queue_category_id FROM settings WHERE singleton = true`,
    )
    const primaryCategoryId = settings.rows[0]?.queue_category_id
    if (!primaryCategoryId) {
      await interaction.editReply('No queue category set. Run setup-bot first.')
      return
    }

    // Build ordered list of categories with available slots
    const allCategoryIds = [primaryCategoryId, ...OVERFLOW_CATEGORY_IDS]
    const slots: { id: string; available: number }[] = []

    for (const catId of allCategoryIds) {
      const cat = await guild.channels.fetch(catId).catch(() => null)
      const currentCount =
        cat && cat.type === ChannelType.GuildCategory
          ? cat.children.cache.size
          : 0
      const available = Math.max(0, MAX_PER_CATEGORY - currentCount)
      slots.push({ id: catId, available })
    }

    // Build the ordered list of categories to create in
    const plan: string[] = []
    for (const slot of slots) {
      for (let i = 0; i < slot.available && plan.length < count; i++) {
        plan.push(slot.id)
      }
      if (plan.length >= count) break
    }

    if (plan.length < count) {
      await interaction.editReply(
        `Not enough space across all categories. Can create at most **${plan.length}** reserve channel(s).`,
      )
      return
    }

    const created: string[] = []
    const failed: number[] = []

    for (let i = 0; i < plan.length; i++) {
      try {
        const channel = await guild.channels.create({
          name: 'reserve-channel',
          type: ChannelType.GuildText,
          parent: plan[i],
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: [PermissionFlagsBits.ViewChannel],
            },
          ],
        })
        await addReserveChannel(channel.id)
        created.push(channel.id)
      } catch (err) {
        console.error(`Failed to create reserve channel ${i + 1}:`, err)
        failed.push(i + 1)
      }

      // Stagger creates to avoid hitting the channel creation rate limit
      if (i < plan.length - 1) await new Promise((r) => setTimeout(r, 1250))
    }

    await interaction.editReply(
      `Created **${created.length}** reserve channel(s).${failed.length ? ` Failed: ${failed.length}.` : ''}`,
    )
  },
}

import { ChannelType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js'
import { addReserveChannel } from '../../utils/queryDB'
import { pool } from '../../db'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    const count = interaction.options.getInteger('count', false) ?? 25

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const guild = interaction.guild!
    const settings = await pool.query(
      `SELECT queue_category_id FROM settings WHERE singleton = true`,
    )
    const categoryId = settings.rows[0]?.queue_category_id
    if (!categoryId) {
      await interaction.editReply('No queue category set. Run setup-bot first.')
      return
    }

    const created: string[] = []
    const failed: number[] = []

    for (let i = 0; i < count; i++) {
      try {
        const channel = await guild.channels.create({
          name: 'reserve-channel',
          type: ChannelType.GuildText,
          parent: categoryId,
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
      if (i < count - 1) await new Promise((r) => setTimeout(r, 1250))
    }

    await interaction.editReply(
      `Created **${created.length}** reserve channel(s).${failed.length ? ` Failed: ${failed.length}.` : ''}`,
    )
  },
}

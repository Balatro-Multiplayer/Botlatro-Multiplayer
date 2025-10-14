import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { pool } from '../../db'

export default {
  data: new SlashCommandBuilder()
    .setName('purge-open-matches')
    .setDescription('[ADMIN] Purge matches that are open but dont exist')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const res = await pool.query(`
        SELECT channel_id FROM matches WHERE open = true
      `)
      const sleep = async (ms: number) => {
        return new Promise((resolve) => setTimeout(resolve, ms))
      }

      const openMatchChannels = res.rows.map((row) => row.channel_id)
      for (const openMatchChannel of openMatchChannels) {
        await sleep(20000) // minute
        console.log(`PURGE: checking ${openMatchChannel}...`)
        const channel = await interaction
          .guild!.channels.fetch(openMatchChannel)
          .catch(() => null)
        if (!channel || !channel.id) {
          console.log('PURGE: null channel')
          await pool.query(
            `
            UPDATE matches SET open = false WHERE channel_id = $1
          `,
            [openMatchChannel],
          )
          const res = await pool.query(
            `
            SELECT open from matches WHERE channel_id = $1
          `,
            [openMatchChannel],
          )
          console.log(`PURGE: channel status = ${res.rows[0].open}`)
        } else {
          console.log('PURGE: not null channel')
        }
      }

      await interaction.editReply('Open matches purged')
    } catch (e) {
      console.error(e)
    }
  },
}

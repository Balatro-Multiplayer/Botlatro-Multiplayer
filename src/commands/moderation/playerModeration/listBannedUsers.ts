import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../../db'
import { Bans } from 'psqlDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const bannedUsers: Bans[] = (await pool.query(`SELECT * FROM "bans"`))
        .rows

      let response = `Banned Users:\n`
      for (const user of bannedUsers) {
        response += `${user.user_id} - ${user.reason} (expires ${user.expires_at?.getDate() ?? 'never'})\n`
      }

      await interaction.editReply(response)
    } catch (err: any) {
      console.error(err)
    }
  },
}

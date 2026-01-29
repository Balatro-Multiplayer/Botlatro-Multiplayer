import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../../db'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()
      const user = interaction.options.getString('user', true)
      const reason =
        interaction.options.getString('reason', false) ?? 'No reason provided'

      // Unban user in db todo: add an active flag to ban so we arent removing any log of the original ban
      const res = await pool.query(
        `
        DELETE FROM "bans" WHERE user_id = $1 RETURNING *
      `,
        [user],
      )

      await interaction.editReply(
        `User ${user} unbanned ${reason ? `for ${reason}` : ''}`,
      )
    } catch (err: any) {
      console.error(err)
    }
  },
}

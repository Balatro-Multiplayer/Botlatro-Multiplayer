import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../../db'
import { createEmbedType, logStrike } from '../../../utils/logCommandUse'

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

      if (res.rowCount === 0) {
        return await interaction.editReply(
          `User ${user} can not be found with a valid ban to remove.`,
        )
      }

      // log unban
      const embedType = createEmbedType(
        `Ban removed for ${user}`,
        '',
        65280, // green
        [
          {
            name: 'Reason:',
            value: reason ?? 'No reason provided',
            inline: true,
          },
        ],
        null,
        `${interaction.user.displayName}`,
      )
      await logStrike('general', embedType)

      await interaction.editReply(
        `User ${user} unbanned ${reason ? `for ${reason}` : ''}`,
      )
    } catch (err: any) {
      console.error(err)
    }
  },
}

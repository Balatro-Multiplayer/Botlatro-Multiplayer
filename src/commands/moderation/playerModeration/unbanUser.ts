import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { moderationMessages } from '../../../config/moderationMessages'
import { pool } from '../../../db'
import { createEmbedType, logStrike } from '../../../utils/logCommandUse'
import { sendDm } from '../../../utils/sendDm'
import { getGuildDisplayName } from './moderationLogUtils'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()
      const user = interaction.options.getString('user', true)
      const reason =
        interaction.options.getString('reason', false) ?? 'None provided'
      const moderatorName = await getGuildDisplayName(
        interaction.guild,
        interaction.user.id,
        interaction.user.username,
      )

      // Unban user in db todo: add an active flag to ban so we arent removing any log of the original ban
      const res = await pool.query(
        `
        DELETE FROM "bans" WHERE user_id = $1 RETURNING *
      `,
        [user],
      )

      // get username from user id
      const member = await interaction.guild?.members.fetch(user)
      const username = member?.displayName ?? user

      if (res.rowCount === 0) {
        return await interaction.editReply(
          `User ${username} can not be found with a valid ban to remove.`,
        )
      }

      // log unban
      const embedType = createEmbedType(
        'BAN REMOVED',
        `<@${user}>`,
        65280,
        [
          {
            name: 'Reason',
            value: reason,
            inline: false,
          },
        ],
        null,
        moderatorName,
      )
      await logStrike('general', embedType)
      await sendDm(user, moderationMessages.banLiftedDm({ reason }))

      await interaction.editReply(
        `User ${member?.user ?? username} unbanned - reason: ${reason}`,
      )
    } catch (err: any) {
      console.error(err)
    }
  },
}

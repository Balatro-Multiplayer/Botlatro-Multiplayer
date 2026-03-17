import { ChatInputCommandInteraction } from 'discord.js'
import { moderationMessages } from '../../../config/moderationMessages'
import { pool } from '../../../db'
import { createEmbedType, logStrike } from '../../../utils/logCommandUse'
import { sendDm } from '../../../utils/sendDm'
import { formatDiscordDate, getGuildDisplayName } from './moderationLogUtils'

type ExistingBanRow = {
  expires_at: Date | null
}

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()
      const user = interaction.options.getUser('user', true)
      const reason = interaction.options.getString('reason', true).trim()
      const timespan = interaction.options.getNumber('length', true)

      // calculate expiry time in ms from days
      const timespanMs = timespan * 24 * 60 * 60 * 1000

      // add that to current time to get expiry time
      const expiryTime = new Date(Date.now() + timespanMs)
      const moderatorName = await getGuildDisplayName(
        interaction.guild,
        interaction.user.id,
        interaction.user.username,
      )

      // Ban user in db
      const res = await pool.query(
        `
        INSERT INTO "bans" (user_id, reason, allowed_queue_ids, expires_at, related_strike_ids) 
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING expires_at
      `,
        [user.id, reason, [], expiryTime, []], // related strikes are not used as its a manual ban, and date is set manually for the same reason. todo: add individual queue ban logic
      )

      if (res.rowCount === 0) {
        const existingBan = await pool.query<ExistingBanRow>(
          `
          SELECT expires_at
          FROM "bans"
          WHERE user_id = $1
          LIMIT 1
        `,
          [user.id],
        )
        const existingExpiry = existingBan.rows[0]?.expires_at
        const expiryText = existingExpiry
          ? ` until ${formatDiscordDate(existingExpiry)}`
          : ''

        await interaction.editReply(`User ${user} already banned${expiryText}.`)
        return
      }

      // log ban
      const embedType = createEmbedType(
        'BAN ADDED',
        `<@${user.id}>`,
        16711680,
        [
          {
            name: 'Length',
            value: `${timespan} day${timespan === 1 ? '' : 's'}`,
            inline: true,
          },
          {
            name: 'Expires',
            value: formatDiscordDate(expiryTime),
            inline: true,
          },
          {
            name: 'Reason',
            value: reason,
            inline: false,
          },
          {
            name: 'Source',
            value: 'Manual ban',
            inline: true,
          },
        ],
        null,
        moderatorName,
      )
      await logStrike('general', embedType)
      await sendDm(
        user.id,
        moderationMessages.banDm({ reason, expiresAt: expiryTime }),
      )

      await interaction.editReply(
        `User ${user} banned for ${timespan} days - reason: ${reason}`,
      )
    } catch (err: any) {
      console.error(err)
      await interaction.editReply('Failed to ban user.')
    }
  },
}

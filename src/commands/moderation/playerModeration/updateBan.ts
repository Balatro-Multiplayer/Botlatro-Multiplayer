import { ChatInputCommandInteraction } from 'discord.js'
import type { Bans } from 'psqlDB'
import { moderationMessages } from '../../../config/moderationMessages'
import { pool } from '../../../db'
import { createEmbedType, logStrike } from '../../../utils/logCommandUse'
import { sendDm } from '../../../utils/sendDm'
import { formatDiscordDate, getGuildDisplayName } from './moderationLogUtils'

const DAY_IN_MS = 24 * 60 * 60 * 1000

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()

      const userId = interaction.options.getString('user', true)
      const nextReason = interaction.options.getString('reason', false)
      const nextLength = interaction.options.getNumber('length', false)

      if (nextReason === null && nextLength === null) {
        await interaction.editReply('Provide at least one field to update.')
        return
      }

      const existingBanRes = await pool.query<Bans>(
        `
        SELECT *
        FROM "bans"
        WHERE user_id = $1
        LIMIT 1
      `,
        [userId],
      )
      const existingBan = existingBanRes.rows[0]

      let member = null
      try {
        member = await interaction.guild?.members.fetch(userId)
      } catch {}
      const username = member?.displayName ?? userId

      if (!existingBan) {
        await interaction.editReply(
          `User ${username} can not be found with a valid ban to update.`,
        )
        return
      }

      const updatedReason = nextReason ?? existingBan.reason
      const updatedExpiry =
        nextLength === null
          ? existingBan.expires_at!
          : new Date(Date.now() + nextLength * DAY_IN_MS)

      const updatedBanRes = await pool.query<Bans>(
        `
        UPDATE "bans"
        SET reason = $2,
            expires_at = $3
        WHERE user_id = $1
        RETURNING *
      `,
        [userId, updatedReason, updatedExpiry],
      )
      const updatedBan = updatedBanRes.rows[0]

      const moderatorName = await getGuildDisplayName(
        interaction.guild,
        interaction.user.id,
        interaction.user.username,
      )

      const embedType = createEmbedType(
        'BAN UPDATED',
        `<@${userId}>`,
        16753920,
        [
          {
            name: 'Old Expiry',
            value: formatDiscordDate(existingBan.expires_at),
            inline: true,
          },
          {
            name: 'New Expiry',
            value: formatDiscordDate(updatedBan.expires_at),
            inline: true,
          },
          {
            name: 'Old Reason',
            value: existingBan.reason,
            inline: false,
          },
          {
            name: 'New Reason',
            value: updatedBan.reason,
            inline: false,
          },
        ],
        null,
        moderatorName,
      )
      await logStrike('general', embedType)
      await sendDm(
        userId,
        moderationMessages.banUpdatedDm({
          reason: updatedBan.reason,
          expiresAt: updatedBan.expires_at!,
        }),
      )

      await interaction.editReply(
        `Updated ban for ${member?.user ?? username}. Expires ${formatDiscordDate(updatedBan.expires_at)}. Reason: ${updatedBan.reason}`,
      )
    } catch (err: any) {
      console.error(err)
      await interaction.editReply('Failed to update ban.')
    }
  },
}

import type { Bans } from 'psqlDB'
import { moderationMessages } from '../../config/moderationMessages'
import { pool } from '../../db'
import { createEmbedType, logStrike } from '../../utils/logCommandUse'
import { logModerationEvent } from '../../utils/logModerationEvent'
import { sendDm } from '../../utils/sendDm'
import { resolveModerationTarget } from './resolveModerationTarget'
import { getGuild } from '../../client'

const DAY_IN_MS = 24 * 60 * 60 * 1000

export class CreateBanError extends Error {
  code: 'ALREADY_BANNED'
  expiresAt: Date | null

  constructor(message: string, expiresAt: Date | null) {
    super(message)
    this.code = 'ALREADY_BANNED'
    this.expiresAt = expiresAt
  }
}

type CreateBanParams = {
  userId: string
  blame: string
  length: number
  reason: string
}

type BanRow = Bans & {
  expires_at: Date | null
}

function formatDiscordDate(date: Date | null | undefined) {
  if (!date) return 'Never'

  const timestamp = Math.floor(new Date(date).getTime() / 1000)
  return `<t:${timestamp}:f>`
}

export async function createBan({
  userId,
  blame,
  length,
  reason,
}: CreateBanParams) {
  const trimmedReason = reason.trim()
  const expiryTime =
    length === 0 ? null : new Date(Date.now() + length * DAY_IN_MS)

  const upsertedBan = await pool.query<BanRow>(
    `
      INSERT INTO bans (user_id, reason, allowed_queue_ids, expires_at, related_strike_ids)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE
      SET reason = EXCLUDED.reason,
          allowed_queue_ids = EXCLUDED.allowed_queue_ids,
          expires_at = EXCLUDED.expires_at,
          related_strike_ids = EXCLUDED.related_strike_ids
      WHERE bans.expires_at IS NOT NULL
        AND bans.expires_at <= NOW()
      RETURNING *
    `,
    [userId, trimmedReason, [], expiryTime, []],
  )

  if (upsertedBan.rowCount === 0) {
    const existingBan = await pool.query<Pick<BanRow, 'expires_at'>>(
      `
        SELECT expires_at
        FROM bans
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId],
    )

    throw new CreateBanError(
      'User already banned.',
      existingBan.rows[0]?.expires_at ?? null,
    )
  }

  const ban = upsertedBan.rows[0]
  const target = await resolveModerationTarget(userId)
  const embedType = createEmbedType(
    'BAN ADDED',
    target.fullLabel,
    16711680,
    [
      {
        name: 'Length',
        value:
          length === 0
            ? 'Permanent'
            : `${length} day${length === 1 ? '' : 's'}`,
        inline: true,
      },
      {
        name: 'Expires',
        value: formatDiscordDate(expiryTime),
        inline: true,
      },
      {
        name: 'Reason',
        value: trimmedReason,
        inline: false,
      },
      {
        name: 'Source',
        value: 'Manual ban',
        inline: true,
      },
    ],
    null,
    blame,
  )

  const guild = await getGuild()

  // add blacklisted roles for visibility + tourney blacklisting
  const member = await guild.members.fetch(userId).catch(() => null)
  if (member) {
    await Promise.all([
      member.roles.add('1354296037094854788'),
      member.roles.add('1344793211146600530'),
    ])
  }

  await logStrike('general', embedType)
  await logModerationEvent({
    action: 'ban_create',
    moderatorId: blame,
    targetId: userId,
    reason: trimmedReason,
    details: {
      banId: ban.id,
      lengthDays: length === 0 ? null : length,
      expiresAt: expiryTime?.toISOString() ?? null,
      permanent: length === 0,
    },
  })
  await sendDm(
    userId,
    moderationMessages.banDm({ reason: trimmedReason, expiresAt: expiryTime }),
  )

  return {
    ban,
  }
}

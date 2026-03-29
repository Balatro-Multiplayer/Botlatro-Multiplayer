import type { Bans } from 'psqlDB'
import { client } from '../../client'
import { moderationMessages } from '../../config/moderationMessages'
import { pool } from '../../db'
import { createEmbedType, logStrike } from '../../utils/logCommandUse'
import { logModerationEvent } from '../../utils/logModerationEvent'
import { sendDm } from '../../utils/sendDm'

const DAY_IN_MS = 24 * 60 * 60 * 1000

export class UpdateBanError extends Error {
  code: 'NO_FIELDS' | 'NOT_FOUND'

  constructor(code: 'NO_FIELDS' | 'NOT_FOUND', message: string) {
    super(message)
    this.code = code
  }
}

type UpdateBanParams = {
  userId: string
  blame: string
  length?: number | null
  reason?: string | null
}

type BanRow = Bans & {
  expires_at: Date | null
}

async function getTargetDisplayName(userId: string) {
  try {
    const user = await client.users.fetch(userId)
    return user.globalName ?? user.username ?? userId
  } catch {
    return userId
  }
}

function serializeDate(value: Date | null | undefined) {
  return value?.toISOString() ?? 'Never'
}

export async function updateBan({
  userId,
  blame,
  length,
  reason,
}: UpdateBanParams) {
  if (length == null && reason == null) {
    throw new UpdateBanError(
      'NO_FIELDS',
      'Provide at least one field to update.',
    )
  }

  const existingBanRes = await pool.query<BanRow>(
    `
      SELECT *
      FROM bans
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
  )
  const existingBan = existingBanRes.rows[0]

  if (!existingBan) {
    throw new UpdateBanError('NOT_FOUND', 'Ban not found')
  }

  const nextReason =
    reason == null ? existingBan.reason : reason.trim() || 'None provided'
  const nextExpiry =
    length == null
      ? existingBan.expires_at
      : length === 0
        ? null
        : new Date(Date.now() + length * DAY_IN_MS)

  const updatedBanRes = await pool.query<BanRow>(
    `
      UPDATE bans
      SET reason = $2,
          expires_at = $3
      WHERE user_id = $1
      RETURNING *
    `,
    [userId, nextReason, nextExpiry],
  )
  const updatedBan = updatedBanRes.rows[0]

  if (!updatedBan) {
    throw new UpdateBanError('NOT_FOUND', 'Ban not found')
  }

  const targetDisplayName = await getTargetDisplayName(userId)
  const embed = createEmbedType(
    `Ban updated for ${targetDisplayName}`,
    '',
    '#ff8c00',
    [
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
      {
        name: 'Old Expiry',
        value: serializeDate(existingBan.expires_at),
        inline: true,
      },
      {
        name: 'New Expiry',
        value: serializeDate(updatedBan.expires_at),
        inline: true,
      },
    ],
    null,
    blame,
  )
  await logStrike('general', embed)
  await logModerationEvent({
    action: 'ban_update',
    moderatorId: blame,
    targetId: userId,
    reason: updatedBan.reason,
    details: {
      banId: updatedBan.id,
      oldReason: existingBan.reason,
      newReason: updatedBan.reason,
      oldExpiresAt: existingBan.expires_at?.toISOString() ?? null,
      newExpiresAt: updatedBan.expires_at?.toISOString() ?? null,
    },
  })

  if (updatedBan.expires_at) {
    await sendDm(
      userId,
      moderationMessages.banUpdatedDm({
        reason: updatedBan.reason,
        expiresAt: updatedBan.expires_at,
      }),
    )
  }

  return {
    existingBan,
    updatedBan,
    targetDisplayName,
  }
}

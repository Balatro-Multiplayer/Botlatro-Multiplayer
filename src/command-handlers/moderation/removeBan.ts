import type { Bans } from 'psqlDB'
import { client } from '../../client'
import { moderationMessages } from '../../config/moderationMessages'
import { pool } from '../../db'
import { createEmbedType, logStrike } from '../../utils/logCommandUse'
import { logModerationEvent } from '../../utils/logModerationEvent'
import { sendDm } from '../../utils/sendDm'

export class RemoveBanError extends Error {
  code: 'NOT_FOUND'

  constructor(message: string) {
    super(message)
    this.code = 'NOT_FOUND'
  }
}

type RemoveBanParams = {
  userId: string
  blame: string
  reason: string
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

export async function removeBan({ userId, blame, reason }: RemoveBanParams) {
  const trimmedReason = reason.trim()

  const removedBanRes = await pool.query<BanRow>(
    `
      DELETE FROM bans
      WHERE user_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING *
    `,
    [userId],
  )
  const removedBan = removedBanRes.rows[0]

  if (!removedBan) {
    throw new RemoveBanError('Ban not found')
  }

  const targetDisplayName = await getTargetDisplayName(userId)
  const embed = createEmbedType(
    `Ban removed for ${targetDisplayName}`,
    '',
    '#00ff00',
    [
      {
        name: 'Reason',
        value: removedBan.reason,
        inline: true,
      },
      {
        name: 'Expires',
        value: serializeDate(removedBan.expires_at),
        inline: true,
      },
      {
        name: 'Removal Reason',
        value: trimmedReason,
        inline: false,
      },
    ],
    null,
    blame,
  )
  await logStrike('general', embed)
  await logModerationEvent({
    action: 'ban_remove',
    moderatorId: blame,
    targetId: userId,
    reason: trimmedReason,
    details: {
      banId: removedBan.id,
      originalReason: removedBan.reason,
      expiresAt: removedBan.expires_at?.toISOString() ?? null,
    },
  })
  await sendDm(userId, moderationMessages.banLiftedDm({ reason: trimmedReason }))

  return {
    removedBan,
    targetDisplayName,
  }
}

import type { Strikes } from 'psqlDB'
import { client, getGuild } from '../../client'
import { pool } from '../../db'
import { createEmbedType, logStrike } from '../../utils/logCommandUse'
import { logModerationEvent } from '../../utils/logModerationEvent'
import { resolveModerationTarget } from './resolveModerationTarget'

export class RemoveStrikeError extends Error {
  code: 'NOT_FOUND'

  constructor(message: string) {
    super(message)
    this.code = 'NOT_FOUND'
  }
}

type RemoveStrikeParams = {
  strikeId: number | string
  removedById?: string
  blame?: string | null
  reason?: string | null
}

type StrikeRow = Strikes & {
  issued_at: Date
  expires_at: Date | null
}

function formatDiscordDate(date: Date | null | undefined) {
  if (!date) return 'Never'

  const timestamp = Math.floor(new Date(date).getTime() / 1000)
  return `<t:${timestamp}:f>`
}

async function resolveBlame({
  removedById,
  blame,
}: Pick<RemoveStrikeParams, 'removedById' | 'blame'>) {
  const trimmedBlame = blame?.trim()
  if (trimmedBlame) return trimmedBlame
  if (!removedById) return 'Unknown moderator'

  try {
    const guild = await getGuild()
    const member =
      guild.members.cache.get(removedById) ??
      (await guild.members.fetch(removedById))
    return member.displayName
  } catch {}

  try {
    const user =
      client.users.cache.get(removedById) ??
      (await client.users.fetch(removedById))
    return user.globalName ?? user.username ?? removedById
  } catch {
    return removedById
  }
}

function createRemoveStrikeMessage(
  strike: Pick<StrikeRow, 'id' | 'amount' | 'reason'>,
  removalReason: string | null,
) {
  const removalReasonText = removalReason
    ? ` Removal reason: ${removalReason}`
    : ''

  return `Removed strike #${strike.id} (${strike.amount}). Original reason: ${strike.reason}.${removalReasonText}`
}

export async function removeStrike({
  strikeId,
  removedById,
  blame,
  reason,
}: RemoveStrikeParams) {
  const resolvedBlame = await resolveBlame({ removedById, blame })
  const removedRes = await pool.query<StrikeRow>(
    `
      DELETE FROM strikes
      WHERE id = $1
      RETURNING *
    `,
    [strikeId],
  )
  const strike = removedRes.rows[0]

  if (!strike) {
    throw new RemoveStrikeError('Strike not found')
  }

  const trimmedReason = reason?.trim() || null
  const target = await resolveModerationTarget(strike.user_id)
  const fields = [
    { name: 'Strike', value: `#${strike.id}`, inline: true },
    { name: 'Amount', value: `${strike.amount}`, inline: true },
    {
      name: 'Issued',
      value: formatDiscordDate(strike.issued_at),
      inline: true,
    },
    {
      name: 'Expires',
      value: formatDiscordDate(strike.expires_at),
      inline: true,
    },
    { name: 'Source', value: strike.reference, inline: true },
    { name: 'Reason', value: strike.reason, inline: false },
  ]

  if (trimmedReason) {
    fields.push({
      name: 'Removal Reason',
      value: trimmedReason,
      inline: false,
    })
  }

  const embed = createEmbedType(
    'STRIKE REMOVED',
    target.fullLabel,
    65280,
    fields,
    null,
    resolvedBlame,
  )
  await logStrike('remove_strike', embed)
  await logModerationEvent({
    action: 'strike_remove',
    moderatorId: removedById ?? 'unknown',
    targetId: strike.user_id,
    reason: trimmedReason,
    details: {
      strikeId: strike.id,
      amount: strike.amount,
      originalReason: strike.reason,
      reference: strike.reference,
    },
  })

  return {
    strike,
    removalReason: trimmedReason,
    message: createRemoveStrikeMessage(strike, trimmedReason),
  }
}

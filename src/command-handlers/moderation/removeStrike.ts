import type { Strikes } from 'psqlDB'
import { pool } from '../../db'
import { createEmbedType, logStrike } from '../../utils/logCommandUse'

export class RemoveStrikeError extends Error {
  code: 'NOT_FOUND'

  constructor(message: string) {
    super(message)
    this.code = 'NOT_FOUND'
  }
}

type RemoveStrikeParams = {
  strikeId: number | string
  blame: string
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

export async function removeStrike({
  strikeId,
  blame,
  reason,
}: RemoveStrikeParams) {
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
    `<@${strike.user_id}>`,
    65280,
    fields,
    null,
    blame,
  )
  await logStrike('remove_strike', embed)

  return {
    strike,
    removalReason: trimmedReason,
  }
}

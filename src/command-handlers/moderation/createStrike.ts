import type { Strikes } from 'psqlDB'
import { moderationMessages } from '../../config/moderationMessages'
import { pool } from '../../db'
import { calculateExpiryDate } from '../../utils/calculateExpiryDate'
import { createEmbedType, logStrike } from '../../utils/logCommandUse'
import { logModerationEvent } from '../../utils/logModerationEvent'
import { sendDm } from '../../utils/sendDm'
import { resolveModerationTarget } from './resolveModerationTarget'

const DEFAULT_STRIKE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

type CreateStrikeParams = {
  userId: string
  issuedById: string
  blame: string
  amount: number
  reason: string
  reference: string
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

export async function createStrike({
  userId,
  issuedById,
  blame,
  amount,
  reason,
  reference,
}: CreateStrikeParams) {
  const trimmedReason = reason.trim()
  const trimmedReference = reference.trim() || 'No reference provided'
  const hasPriorStrikes =
    (
      await pool.query(
        `
          SELECT id
          FROM strikes
          WHERE user_id = $1
          LIMIT 1
        `,
        [userId],
      )
    ).rowCount !== 0

  const finalAmount = hasPriorStrikes && amount === 0 ? 1 : amount
  const expiresAt =
    (await calculateExpiryDate(userId)) ??
    new Date(Date.now() + DEFAULT_STRIKE_EXPIRY_MS)
  const issuedAt = new Date()

  const inserted = await pool.query<StrikeRow>(
    `
      INSERT INTO strikes (user_id, reason, issued_by_id, issued_at, expires_at, amount, reference)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      userId,
      trimmedReason,
      issuedById,
      issuedAt,
      expiresAt,
      finalAmount,
      trimmedReference,
    ],
  )
  const strike = inserted.rows[0]

  const totalRes = await pool.query<{ total: number }>(
    `
      SELECT COALESCE(SUM(amount), 0)::int AS total
      FROM strikes
      WHERE user_id = $1
    `,
    [userId],
  )
  const totalStrikes = Number(totalRes.rows[0]?.total ?? 0)
  const target = await resolveModerationTarget(userId)

  const embed = createEmbedType(
    'STRIKE ADDED',
    target.fullLabel,
    16711680,
    [
      { name: 'Strike', value: `#${strike.id}`, inline: true },
      { name: 'Amount', value: `${finalAmount}`, inline: true },
      { name: 'Total', value: `${totalStrikes}`, inline: true },
      {
        name: 'Expires',
        value: formatDiscordDate(strike.expires_at),
        inline: true,
      },
      { name: 'Source', value: trimmedReference, inline: true },
      { name: 'Reason', value: trimmedReason, inline: false },
    ],
    null,
    blame,
  )

  await logStrike('add_strike', embed)
  await logModerationEvent({
    action: 'strike_create',
    moderatorId: issuedById,
    targetId: userId,
    reason: trimmedReason,
    details: {
      strikeId: strike.id,
      amount: finalAmount,
      totalStrikes,
      reference: trimmedReference,
      expiresAt: expiresAt.toISOString(),
    },
  })
  await sendDm(
    userId,
    moderationMessages.strikeDm({
      amount: finalAmount,
      reason: trimmedReason,
      totalStrikes,
    }),
  )

  return {
    strike,
    totalStrikes,
    finalAmount,
  }
}

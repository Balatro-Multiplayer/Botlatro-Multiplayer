import { Guild } from 'discord.js'
import type { Bans, Strikes } from 'psqlDB'

function normalizeText(
  value: string | number | null | undefined,
  maxLength: number = 180,
) {
  const text = `${value ?? 'None provided'}`.trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

export function formatDiscordDate(
  date: Date | null | undefined,
  style: 'd' | 'D' | 'f' | 'F' | 'R' = 'f',
) {
  if (!date) return 'Never'

  const timestamp = Math.floor(new Date(date).getTime() / 1000)
  return `<t:${timestamp}:${style}>`
}

function formatDatePair(date: Date | null | undefined) {
  if (!date) return 'Never'
  return `${formatDiscordDate(date)} (${formatDiscordDate(date, 'R')})`
}

// A null expiry means permanent (e.g. a permanent ban), which never expires.
export function isExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}


export function formatBanLogEntry(ban: Bans, targetLabel: string) {
  const relatedStrikes =
    ban.related_strike_ids && ban.related_strike_ids.length > 0
      ? ban.related_strike_ids.map((id) => `#${id}`).join(', ')
      : 'Manual'

  const expired = isExpired(ban.expires_at)
  const statusTag = expired ? '🟥 [EXPIRED]' : '🟩 [ACTIVE]'

  return [
    `${statusTag} ${targetLabel}`,
    `Reason: ${normalizeText(ban.reason, 220)}`,
    `${expired ? 'Expired' : 'Expires'}: ${formatDatePair(ban.expires_at)}`,
    `Source: ${relatedStrikes}`,
  ].join('\n')
}

export function formatStrikeLogEntry(strike: Strikes, issuedBy: string) {
  const strikeAmountLabel =
    strike.amount === 1 ? '1 strike' : `${strike.amount} strikes`

  const expired = isExpired(strike.expires_at)
  const statusTag = expired ? '🟥 [EXPIRED]' : '🟩 [ACTIVE]'

  return [
    `${statusTag} #${strike.id} · ${strikeAmountLabel}`,
    `Reason: ${normalizeText(strike.reason, 220)}`,
    `Issued by: ${issuedBy}`,
    `Reference: ${normalizeText(strike.reference, 100)}`,
    `Issued: ${formatDatePair(strike.issued_at)}`,
    `${expired ? 'Expired' : 'Expires'}: ${formatDatePair(strike.expires_at)}`,
  ].join('\n')
}

export async function getGuildDisplayName(
  guild: Guild | null | undefined,
  userId: string,
  fallback: string,
) {
  if (!guild) return fallback

  try {
    const member =
      guild.members.cache.get(userId) ?? (await guild.members.fetch(userId))
    return member.displayName
  } catch {
    return fallback
  }
}

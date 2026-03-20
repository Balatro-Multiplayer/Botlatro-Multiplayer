import { EmbedBuilder, Guild } from 'discord.js'
import type { Bans, Strikes } from 'psqlDB'

const MODERATION_LIST_COLOR = 0x5865f2
const MAX_FIELD_VALUE_LENGTH = 1024

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

function chunkEntries(entries: string[]) {
  const chunks: { start: number; end: number; value: string }[] = []
  let currentValue = ''
  let currentStart = 0

  entries.forEach((entry, index) => {
    const nextValue =
      currentValue.length === 0 ? entry : `${currentValue}\n\n${entry}`

    if (nextValue.length > MAX_FIELD_VALUE_LENGTH && currentValue.length > 0) {
      chunks.push({
        start: currentStart + 1,
        end: index,
        value: currentValue,
      })
      currentValue = entry
      currentStart = index
      return
    }

    currentValue = nextValue
  })

  if (currentValue.length > 0) {
    chunks.push({
      start: currentStart + 1,
      end: entries.length,
      value: currentValue,
    })
  }

  return chunks
}

export function createModerationListEmbed({
  title,
  summary,
  emptyState,
  entries,
}: {
  title: string
  summary: string
  emptyState: string
  entries: string[]
}) {
  const embed = new EmbedBuilder()
    .setColor(MODERATION_LIST_COLOR)
    .setTitle(title)
    .setDescription(summary)
    .setTimestamp()

  if (entries.length === 0) {
    embed.addFields({ name: 'Entries', value: emptyState, inline: false })
    return embed
  }

  const chunks = chunkEntries(entries)
  for (const chunk of chunks) {
    embed.addFields({
      name:
        chunks.length === 1 ? 'Entries' : `Entries ${chunk.start}-${chunk.end}`,
      value: chunk.value,
      inline: false,
    })
  }

  return embed
}

export function formatBanLogEntry(ban: Bans, targetLabel: string) {
  const relatedStrikes =
    ban.related_strike_ids && ban.related_strike_ids.length > 0
      ? ban.related_strike_ids.map((id) => `#${id}`).join(', ')
      : 'Manual'

  return [
    targetLabel,
    `Reason: ${normalizeText(ban.reason, 220)}`,
    `Expires: ${formatDatePair(ban.expires_at)}`,
    `Source: ${relatedStrikes}`,
  ].join('\n')
}

export function formatStrikeLogEntry(strike: Strikes, issuedBy: string) {
  const strikeAmountLabel =
    strike.amount === 1 ? '1 strike' : `${strike.amount} strikes`

  return [
    `#${strike.id} · ${strikeAmountLabel}`,
    `Reason: ${normalizeText(strike.reason, 220)}`,
    `Issued by: ${issuedBy}`,
    `Reference: ${normalizeText(strike.reference, 100)}`,
    `Issued: ${formatDatePair(strike.issued_at)}`,
    `Expires: ${formatDatePair(strike.expires_at)}`,
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

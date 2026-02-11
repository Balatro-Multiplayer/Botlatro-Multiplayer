import { client } from '../client'

// Cache: key is "deckkey__stakekey", value is the full Discord emote string "<:name:id>"
const combinedEmoteCache = new Map<string, string>()

/**
 * Derives the combined emote lookup key from a deck name and stake name.
 * "Red Deck" + "Gold Stake" => "red__gold"
 */
export function getCombinedEmoteKey(
  deckName: string,
  stakeName: string,
): string {
  const deckKey = deckName.replace(/\s*Deck$/i, '').toLowerCase()
  const stakeKey = stakeName.replace(/\s*Stake$/i, '').toLowerCase()
  return `${deckKey}__${stakeKey}`
}

/**
 * Fetches all application emojis, filters those matching the double-underscore pattern,
 * and populates the cache. Call once at bot startup.
 */
export async function preloadCombinedEmotes(): Promise<void> {
  console.log('Preloading combined matchup emotes...')
  try {
    const emojis = await client.application!.emojis.fetch()

    let count = 0
    emojis.forEach((emoji) => {
      if (emoji.name && emoji.name.includes('__')) {
        const key = emoji.name.toLowerCase()
        combinedEmoteCache.set(key, `<:${emoji.name}:${emoji.id}>`)
        count++
      }
    })

    console.log(`Preloaded ${count} combined matchup emotes`)
  } catch (error) {
    console.error('Failed to preload combined emotes:', error)
  }
}

/**
 * Returns the combined emote string for a deck+stake pair, or null if not found.
 */
export function getCombinedEmote(
  deckName: string,
  stakeName: string,
): string | null {
  const key = getCombinedEmoteKey(deckName, stakeName)
  return combinedEmoteCache.get(key) ?? null
}

/**
 * Returns the combined emote if available, otherwise falls back to separate emotes.
 */
export function getCombinedOrFallback(
  deckName: string,
  stakeName: string,
  deckEmote: string,
  stakeEmote: string,
): string {
  return getCombinedEmote(deckName, stakeName) ?? `${deckEmote} ${stakeEmote}`
}

/**
 * Parses a Discord custom emoji string into { name, id } for use with setEmoji().
 * Returns null if the string is not a valid custom emoji format.
 */
export function parseEmoji(
  emoteStr: string,
): { name: string; id: string } | null {
  const match = emoteStr.match(/<:(\w+):(\d+)>/)
  if (!match) return null
  return { name: match[1], id: match[2] }
}

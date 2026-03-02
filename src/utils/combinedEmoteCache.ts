import { client } from '../client'
import { Decks, Stakes } from 'psqlDB'

// Cache: key is "deckkey__stakekey", value is the full Discord emote string "<:name:id>"
const combinedEmoteCache = new Map<string, string>()

/**
 * Returns the emote name for a deck, using emote_name if set, otherwise deriving it from deck_name.
 * "Virt's Cocktail" with emote_name "cocktail" => "cocktail"
 * "Red Deck" with no emote_name => "red"
 */
export function getDeckEmoteName(deck: Decks): string {
  return deck.emote_name ?? deck.deck_name.replace(/\s*Deck$/i, '').toLowerCase()
}

/**
 * Returns the emote name for a stake, using emote_name if set, otherwise deriving it from stake_name.
 * "White Stake" with no emote_name => "white"
 */
export function getStakeEmoteName(stake: Stakes): string {
  return stake.emote_name ?? stake.stake_name.replace(/\s*Stake$/i, '').toLowerCase()
}

/**
 * Builds the combined emote lookup key from a deck emote name and stake emote name.
 * "cocktail" + "white" => "cocktail__white"
 */
export function getCombinedEmoteKey(
  deckEmoteName: string,
  stakeEmoteName: string,
): string {
  return `${deckEmoteName}__${stakeEmoteName}`
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
 * Returns the combined emote string for a deck+stake pair by their emote names, or null if not found.
 */
export function getCombinedEmote(
  deckEmoteName: string,
  stakeEmoteName: string,
): string | null {
  const key = getCombinedEmoteKey(deckEmoteName, stakeEmoteName)
  return combinedEmoteCache.get(key) ?? null
}

/**
 * Returns the combined emote if available, otherwise falls back to separate emotes.
 */
export function getCombinedOrFallback(
  deckEmoteName: string,
  stakeEmoteName: string,
  deckEmote: string,
  stakeEmote: string,
): string {
  return getCombinedEmote(deckEmoteName, stakeEmoteName) ?? `${deckEmote} ${stakeEmote}`
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

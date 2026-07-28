/**
 * Season-keyed MMR rank thresholds for the /stats graph (colour bands, guide
 * lines, and guide-line labels).
 *
 * Seasons 1-6 predate the +300 default-MMR bump and use the OLD thresholds;
 * season 7 onward — and any unmapped/future season — use the NEW thresholds.
 *
 * ┌─ IF A SEASON CHANGES THE RANK CUTOFFS, THIS FILE MUST BE UPDATED TOO ─┐
 *
 * These numbers are a hand-maintained copy of the website's
 * `src/shared/ranks.ts` (`SEASON_THRESHOLDS`) in the `Balatro-Multiplayer/www`
 * repo. Nothing keeps the two in step automatically. That is exactly how the
 * bug this file fixes happened: the site was updated for season 7's +300 bump
 * and the bot's copy was not, so the graph drew season 7 ranks at season 6
 * boundaries for weeks.
 *
 * The live rank roles (`queue_roles.mmr_threshold`, which drive the rank badge
 * and rank-up bar) are a third copy, but they hold only the *current* season's
 * values, so they cannot serve historical graphs. Reading them here was
 * considered and rejected: cutoffs move about once a season, and the extra
 * async path and silent-mismatch risk cost more than the annual edit saves.
 *
 * So: when a season moves the cutoffs, add its entry below AND update the
 * website's table. Anyone doing only one of the two reintroduces the bug.
 *
 * The website recognises four queue "ladders":
 * - `vanilla`  -> no rank at all (`getRankData` returns `null`)
 * - `legacy`   -> MILK, STRAWBERRY, CHOCOLATE, MINT, BUBBLEGUM
 * - `smallworld` -> PEBBLE, FERRITE, PYRITE, JADE, CRYSTAL
 * - anything else (e.g. `ranked`) -> the default enhancement ladder: STONE,
 *   STEEL, GOLD, LUCKY, GLASS
 *
 * Pure/data-only: no I/O, no canvas, no discord.js. Safe to unit test in
 * isolation.
 */

/** Colour-palette keys used for the enhancement (default) queue ranks. */
export type EnhancementColorKey = 'steel' | 'gold' | 'lucky' | 'glass'

/** Colour-palette keys used for the Smallworld queue ranks. */
export type SmallworldColorKey = 'ferrite' | 'pyrite' | 'clover' | 'crystal'

export type RankColorKey = EnhancementColorKey | SmallworldColorKey

/** Which rank ladder a queue uses, mirroring the website's `getRankData`. */
export type QueueLadder = 'enhancement' | 'smallworld' | 'legacy' | 'none'

/** One rank band boundary: the MMR threshold and its associated colour. */
export type RankBand = {
  /** MMR at/above which this band's colour applies. */
  threshold: number
  /** Key into the canvas colour palette (`config.colors`) for this band. */
  colorKey: RankColorKey
}

type ThresholdSet = {
  /** STEEL, GOLD, LUCKY, GLASS, in ascending order. */
  enhancement: readonly [number, number, number, number]
  /** FERRITE, PYRITE, JADE (rendered as "clover"), CRYSTAL, in ascending order. */
  smallworld: readonly [number, number, number, number]
  /** STRAWBERRY, CHOCOLATE, MINT, BUBBLEGUM, in ascending order. */
  legacy: readonly [number, number, number, number]
  /** Starting MMR new players are seeded at for this season. */
  defaultMmr: number
}

/**
 * Queue IDs, mirroring the website's `src/shared/constants.ts` (`QUEUE_IDS`)
 * in the `Balatro-Multiplayer/www` repo. The bot receives numeric queue IDs
 * from the DB, so matching on the ID is exact — unlike display names, which
 * are free text ("Legacy Ranked", "Standard Ranked", …) and were previously
 * keyword-matched. Kept in step with the website manually, same as the
 * threshold tables above.
 */
export const QUEUE_ID_RANKED = 1
export const QUEUE_ID_SMALLWORLD = 2
export const QUEUE_ID_SANDBOX = 3
export const QUEUE_ID_VANILLA = 4
export const QUEUE_ID_CASUAL = 5
export const QUEUE_ID_LEGACY = 7

const ENHANCEMENT_COLOR_KEYS: readonly EnhancementColorKey[] = [
  'steel',
  'gold',
  'lucky',
  'glass',
]

const SMALLWORLD_COLOR_KEYS: readonly SmallworldColorKey[] = [
  'ferrite',
  'pyrite',
  'clover',
  'crystal',
]

// Legacy's tiers are Milk/Strawberry/Chocolate/Mint/Bubblegum on the website,
// but the canvas palette has no colours for them and legacy graphs have always
// been drawn in the enhancement colours. Only the thresholds were wrong, so we
// correct those and leave the colours as players already know them. Swapping in
// a legacy palette later only needs new entries in `config.colors` and this
// list — nothing else changes.
const LEGACY_COLOR_KEYS: readonly RankColorKey[] = ENHANCEMENT_COLOR_KEYS

// Thresholds used for seasons 1-6 (before the +300 default-MMR bump).
// Legacy shares the same numeric boundaries as smallworld today, but is kept
// as its own array so the two ladders can diverge later without repeating
// the bug this file exists to fix.
const OLD_THRESHOLDS: ThresholdSet = {
  enhancement: [230, 320, 460, 620],
  smallworld: [225, 325, 425, 550],
  legacy: [225, 325, 425, 550],
  defaultMmr: 200,
}

// Thresholds for season 7 onward (+300 bump). Also the default for any
// season not explicitly mapped below, including future seasons.
const NEW_THRESHOLDS: ThresholdSet = {
  enhancement: [530, 620, 760, 920],
  smallworld: [525, 625, 725, 850],
  legacy: [525, 625, 725, 850],
  defaultMmr: 500,
}

const DEFAULT_THRESHOLDS = NEW_THRESHOLDS

// Season number -> threshold set. Any season not listed falls back to
// DEFAULT_THRESHOLDS.
const SEASON_THRESHOLDS: Record<number, ThresholdSet> = {
  1: OLD_THRESHOLDS,
  2: OLD_THRESHOLDS,
  3: OLD_THRESHOLDS,
  4: OLD_THRESHOLDS,
  5: OLD_THRESHOLDS,
  6: OLD_THRESHOLDS,
}

function getThresholdSet(season: number): ThresholdSet {
  return SEASON_THRESHOLDS[season] ?? DEFAULT_THRESHOLDS
}

/**
 * Resolves which rank ladder a queue uses from its numeric queue ID —
 * matching the website's `getRankData`, which switches on the same IDs
 * (see `QUEUE_ID_*` above). IDs are exact, unlike the old display-name
 * keyword match this replaced ("Legacy Ranked", "Small World", …), which
 * risked silently falling through to the enhancement ladder on a rename.
 *
 * Unknown or new queue IDs (Casual, Sandbox, or anything not yet minted)
 * default to `'enhancement'`, matching both today's behaviour and the
 * website's `getRankData`, which only special-cases vanilla/legacy/smallworld.
 */
export function getQueueLadder(queueId: number): QueueLadder {
  if (queueId === QUEUE_ID_VANILLA) return 'none'
  if (queueId === QUEUE_ID_SMALLWORLD) return 'smallworld'
  if (queueId === QUEUE_ID_LEGACY) return 'legacy'
  return 'enhancement'
}

/**
 * Returns the ordered rank bands (MMR threshold + colour key) for a given
 * season/queue pair, or `null` when the queue has no rank at all (vanilla —
 * matching the website's `getRankData`, which returns `null` for vanilla).
 * Always 4 entries when non-null, ascending by threshold:
 * - enhancement queues: STEEL, GOLD, LUCKY, GLASS
 * - Smallworld: FERRITE, PYRITE, JADE ("clover"), CRYSTAL
 * - Legacy: STRAWBERRY, CHOCOLATE, MINT, BUBBLEGUM
 *
 * A graph always renders exactly one season, so a single threshold set per
 * call is correct — this is never asked to reconcile two seasons at once.
 */
export function getRankThresholds(
  season: number,
  queueId: number,
): RankBand[] | null {
  const ladder = getQueueLadder(queueId)
  if (ladder === 'none') return null

  const set = getThresholdSet(season)
  const values = set[ladder]
  const colorKeys: readonly RankColorKey[] =
    ladder === 'smallworld'
      ? SMALLWORLD_COLOR_KEYS
      : ladder === 'legacy'
        ? LEGACY_COLOR_KEYS
        : ENHANCEMENT_COLOR_KEYS

  return values.map((threshold, i) => ({
    threshold,
    colorKey: colorKeys[i],
  }))
}

/**
 * Returns the default starting MMR new players are seeded at for a given
 * season — 200 pre-season-7, 500 from season 7 onward (the same +300 bump
 * that moved the rank cutoffs above). Used by the /stats graph to draw a
 * guide line at the MMR players actually start from, instead of a stale
 * hardcoded value.
 */
export function getDefaultMmr(season: number): number {
  return getThresholdSet(season).defaultMmr
}

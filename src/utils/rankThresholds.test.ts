import { describe, expect, test } from 'bun:test'
import {
  getDefaultMmr,
  getQueueLadder,
  getRankThresholds,
  resolveSeasonRank,
  QUEUE_ID_CASUAL,
  QUEUE_ID_LEGACY,
  QUEUE_ID_RANKED,
  QUEUE_ID_SANDBOX,
  QUEUE_ID_SMALLWORLD,
  QUEUE_ID_VANILLA,
} from './rankThresholds'

describe('getQueueLadder', () => {
  test('Ranked (1) resolves to enhancement', () => {
    expect(getQueueLadder(QUEUE_ID_RANKED)).toBe('enhancement')
  })

  test('Smallworld (2) resolves to smallworld', () => {
    expect(getQueueLadder(QUEUE_ID_SMALLWORLD)).toBe('smallworld')
  })

  test('Sandbox (3) resolves to enhancement', () => {
    expect(getQueueLadder(QUEUE_ID_SANDBOX)).toBe('enhancement')
  })

  test('Vanilla (4) resolves to none', () => {
    expect(getQueueLadder(QUEUE_ID_VANILLA)).toBe('none')
  })

  test('Casual (5) resolves to enhancement', () => {
    expect(getQueueLadder(QUEUE_ID_CASUAL)).toBe('enhancement')
  })

  test('Legacy (7) resolves to legacy', () => {
    expect(getQueueLadder(QUEUE_ID_LEGACY)).toBe('legacy')
  })

  test('an unknown/unmapped queue ID defaults to enhancement', () => {
    expect(getQueueLadder(99)).toBe('enhancement')
  })
})

describe('getRankThresholds', () => {
  // These tests are about thresholds and colours; `name` is covered under
  // resolveSeasonRank. Strip it so the expectations stay focused.
  const bands = (season: number, queueId: number) =>
    getRankThresholds(season, queueId)?.map(({ threshold, colorKey }) => ({
      threshold,
      colorKey,
    })) ?? null

  test('season 1 (OLD set) enhancement thresholds', () => {
    expect(bands(1, QUEUE_ID_RANKED)).toEqual([
      { threshold: 230, colorKey: 'steel' },
      { threshold: 320, colorKey: 'gold' },
      { threshold: 460, colorKey: 'lucky' },
      { threshold: 620, colorKey: 'glass' },
    ])
  })

  test('season 6 (last OLD season) enhancement thresholds', () => {
    expect(bands(6, QUEUE_ID_RANKED)).toEqual([
      { threshold: 230, colorKey: 'steel' },
      { threshold: 320, colorKey: 'gold' },
      { threshold: 460, colorKey: 'lucky' },
      { threshold: 620, colorKey: 'glass' },
    ])
  })

  test('season 7 (first NEW season) enhancement thresholds reflect the +300 bump', () => {
    expect(bands(7, QUEUE_ID_RANKED)).toEqual([
      { threshold: 530, colorKey: 'steel' },
      { threshold: 620, colorKey: 'gold' },
      { threshold: 760, colorKey: 'lucky' },
      { threshold: 920, colorKey: 'glass' },
    ])
  })

  test('season 8 (NEW set) enhancement thresholds', () => {
    expect(bands(8, QUEUE_ID_RANKED)).toEqual([
      { threshold: 530, colorKey: 'steel' },
      { threshold: 620, colorKey: 'gold' },
      { threshold: 760, colorKey: 'lucky' },
      { threshold: 920, colorKey: 'glass' },
    ])
  })

  test('an unmapped future season defaults to the NEW set', () => {
    expect(bands(99, QUEUE_ID_RANKED)).toEqual(
      bands(8, QUEUE_ID_RANKED),
    )
  })

  test('Smallworld queue uses its own OLD thresholds for seasons 1-6', () => {
    expect(bands(6, QUEUE_ID_SMALLWORLD)).toEqual([
      { threshold: 225, colorKey: 'ferrite' },
      { threshold: 325, colorKey: 'pyrite' },
      { threshold: 425, colorKey: 'clover' },
      { threshold: 550, colorKey: 'crystal' },
    ])
  })

  test('Smallworld queue uses its own NEW thresholds for season 7+', () => {
    expect(bands(7, QUEUE_ID_SMALLWORLD)).toEqual([
      { threshold: 525, colorKey: 'ferrite' },
      { threshold: 625, colorKey: 'pyrite' },
      { threshold: 725, colorKey: 'clover' },
      { threshold: 850, colorKey: 'crystal' },
    ])
  })

  // Legacy's tiers are Milk/Strawberry/... on the website, but the canvas has
  // no palette for them, so legacy keeps the enhancement colours it has always
  // been drawn in. Only the thresholds differ from enhancement.
  test('Legacy queue uses OLD thresholds for seasons 1-6', () => {
    expect(bands(6, QUEUE_ID_LEGACY)).toEqual([
      { threshold: 225, colorKey: 'steel' },
      { threshold: 325, colorKey: 'gold' },
      { threshold: 425, colorKey: 'lucky' },
      { threshold: 550, colorKey: 'glass' },
    ])
  })

  test('Legacy queue uses NEW thresholds for season 7+', () => {
    expect(bands(7, QUEUE_ID_LEGACY)).toEqual([
      { threshold: 525, colorKey: 'steel' },
      { threshold: 625, colorKey: 'gold' },
      { threshold: 725, colorKey: 'lucky' },
      { threshold: 850, colorKey: 'glass' },
    ])
  })

  test('Legacy thresholds differ from enhancement despite sharing colours', () => {
    expect(bands(7, QUEUE_ID_LEGACY)).not.toEqual(
      getRankThresholds(7, QUEUE_ID_RANKED),
    )
  })

  test('Vanilla queue returns null for an OLD season', () => {
    expect(bands(1, QUEUE_ID_VANILLA)).toBeNull()
  })

  test('Vanilla queue returns null for a NEW season', () => {
    expect(bands(7, QUEUE_ID_VANILLA)).toBeNull()
  })

  test('an unknown queue ID resolves to the enhancement ladder', () => {
    expect(bands(7, QUEUE_ID_CASUAL)).toEqual(bands(7, QUEUE_ID_RANKED))
    expect(bands(7, QUEUE_ID_SANDBOX)).toEqual(bands(7, QUEUE_ID_RANKED))
    expect(bands(7, 99)).toEqual(bands(7, QUEUE_ID_RANKED))
  })

  test('bands are always 4 entries in ascending threshold order', () => {
    for (const season of [1, 6, 7, 8, 99]) {
      for (const queueId of [
        QUEUE_ID_RANKED,
        QUEUE_ID_SMALLWORLD,
        QUEUE_ID_LEGACY,
      ]) {
        const bands = getRankThresholds(season, queueId)
        expect(bands).not.toBeNull()
        expect(bands).toHaveLength(4)
        const nonNullBands = bands ?? []
        for (let i = 1; i < nonNullBands.length; i++) {
          expect(nonNullBands[i].threshold).toBeGreaterThan(
            nonNullBands[i - 1].threshold,
          )
        }
      }
    }
  })
})

describe('getDefaultMmr', () => {
  test('returns 200 for seasons 1-6 (pre-bump)', () => {
    for (const season of [1, 2, 3, 4, 5, 6]) {
      expect(getDefaultMmr(season)).toBe(200)
    }
  })

  test('returns 500 for season 7+ (post-bump)', () => {
    for (const season of [7, 8]) {
      expect(getDefaultMmr(season)).toBe(500)
    }
  })

  test('returns 500 for an unmapped/future season', () => {
    expect(getDefaultMmr(99)).toBe(500)
  })
})

describe('resolveSeasonRank', () => {
  test('uses the cutoffs of that season, not the current ones', () => {
    // The reported bug: a Smallworld player on 674 in season 6. The bar read
    // queue_roles (season 7 cutoffs) and said "Pyrite, 51 MMR to Jade". On
    // season 6's ladder 674 is above CRYSTAL (550), i.e. max rank.
    const s6 = resolveSeasonRank(6, QUEUE_ID_SMALLWORLD, 674)
    expect(s6?.name).toBe('Crystal')
    expect(s6?.threshold).toBe(550)
    expect(s6?.next).toBeNull()

    // Same MMR under season 7's cutoffs reproduces what the bar was showing.
    const s7 = resolveSeasonRank(7, QUEUE_ID_SMALLWORLD, 674)
    expect(s7?.name).toBe('Pyrite')
    expect(s7?.next?.name).toBe('Jade')
    expect(s7?.next?.threshold).toBe(725)
    expect((s7?.next?.threshold ?? 0) - 674).toBe(51)
  })

  test('returns the base rank below the lowest cutoff', () => {
    expect(resolveSeasonRank(6, QUEUE_ID_RANKED, 100)?.name).toBe('Stone')
    expect(resolveSeasonRank(6, QUEUE_ID_SMALLWORLD, 100)?.name).toBe('Pebble')
    expect(resolveSeasonRank(6, QUEUE_ID_LEGACY, 100)?.name).toBe('Milk')
  })

  test('base rank has no threshold but does have a next rank', () => {
    const r = resolveSeasonRank(6, QUEUE_ID_SMALLWORLD, 100)
    expect(r?.threshold).toBeNull()
    expect(r?.next?.name).toBe('Ferrite')
    expect(r?.next?.threshold).toBe(225)
  })

  test('a threshold is inclusive — landing exactly on it promotes', () => {
    expect(resolveSeasonRank(7, QUEUE_ID_RANKED, 530)?.name).toBe('Steel')
    expect(resolveSeasonRank(7, QUEUE_ID_RANKED, 529)?.name).toBe('Stone')
  })

  test('top rank reports no next rank', () => {
    const r = resolveSeasonRank(7, QUEUE_ID_RANKED, 5000)
    expect(r?.name).toBe('Glass')
    expect(r?.next).toBeNull()
  })

  test('legacy uses its own names', () => {
    expect(resolveSeasonRank(7, QUEUE_ID_LEGACY, 700)?.name).toBe('Chocolate')
    expect(resolveSeasonRank(7, QUEUE_ID_LEGACY, 900)?.name).toBe('Bubblegum')
  })

  test('vanilla has no rank at all', () => {
    expect(resolveSeasonRank(7, QUEUE_ID_VANILLA, 700)).toBeNull()
  })

  test('every rank carries a colour', () => {
    for (const queue of [QUEUE_ID_RANKED, QUEUE_ID_SMALLWORLD, QUEUE_ID_LEGACY])
      for (const mmr of [0, 300, 600, 800, 1000]) {
        const r = resolveSeasonRank(7, queue, mmr)
        expect(r?.color).toMatch(/^#[0-9a-f]{6}$/i)
      }
  })
})

import { getQueueLeaderboard } from '../../utils/queryDB'

export type LeaderboardEntry = {
  rank: number
  id: string
  name: string | null
  mmr: number
  wins: number
  losses: number
  streak: number
  peak_mmr: number
  peak_streak: number
}

/**
 * Gets leaderboard data for a specific queue.
 *
 * @param {number} queueId - The queue ID to fetch leaderboard for.
 * @param {number} limit - Optional maximum number of entries to return. If not provided, returns all entries.
 * @param {number} season - Optional season number to filter matches by.
 * @return {Promise<LeaderboardEntry[]>} A promise that resolves to the leaderboard data.
 */
// Short-lived cache for leaderboard responses. The public website polls this
// endpoint frequently and each call runs an expensive window-function query
// against the shared connection pool; a brief cache collapses repeat hits into
// a single DB read without meaningfully staling the leaderboard.
const LEADERBOARD_CACHE_TTL_MS = 30_000
const leaderboardCache = new Map<
  string,
  { expires: number; data: LeaderboardEntry[] }
>()

export async function getLeaderboard(
  queueId: number,
  limit?: number,
  season?: number,
): Promise<LeaderboardEntry[]> {
  const cacheKey = `${queueId}:${limit ?? 'all'}:${season ?? 'active'}`
  const cached = leaderboardCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    return cached.data
  }

  try {
    const data = await getQueueLeaderboard(queueId, limit, season)
    leaderboardCache.set(cacheKey, {
      expires: Date.now() + LEADERBOARD_CACHE_TTL_MS,
      data,
    })
    return data
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    throw error
  }
}

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
 * @return {Promise<LeaderboardEntry[]>} A promise that resolves to the leaderboard data.
 */
export async function getLeaderboard(
  queueId: number,
  limit?: number,
): Promise<LeaderboardEntry[]> {
  try {
    return await getQueueLeaderboard(queueId, limit)
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    throw error
  }
}

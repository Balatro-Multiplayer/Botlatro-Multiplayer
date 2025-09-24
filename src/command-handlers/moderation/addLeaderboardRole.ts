import { createLeaderboardRole } from '../../utils/queryDB'

/**
 * Creates and adds a queue rank role to a queue.
 *
 * @param {number} queueId - The unique identifier of the queue to add the role to.
 * @param {string} roleId - The unique identifier of the role in discord.
 * @param {number} leaderboardMin - The minimum leaderboard position required to gain this role in the queue.
 * @param {number} leaderboardMax - The max leaderboard position you can have for this role in the queue.
 * @return {Promise<boolean>} A promise that resolves to true if the queue role was created and added, otherwise false.
 */
export async function addLeaderboardRole(
  queueId: number,
  roleId: string,
  leaderboardMin: number,
  leaderboardMax: number,
): Promise<boolean> {
  return await createLeaderboardRole(
    queueId,
    roleId,
    leaderboardMin,
    leaderboardMax,
  )
}

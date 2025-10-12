import { updateQueueRole } from '../../utils/queryDB'

/**
 * Updates a queue rank role in a queue.
 *
 * @param {number} queueId - The unique identifier of the queue containing the role.
 * @param {string} roleId - The unique identifier of the role in discord.
 * @param {number} [mmrThreshold] - The new minimum amount of MMR required to gain this role (optional).
 * @param {string} [emote] - The new emote for this role (optional).
 * @return {Promise<boolean>} A promise that resolves to true if the queue role was updated, otherwise false.
 */
export async function editQueueRole(
  queueId: number,
  roleId: string,
  mmrThreshold?: number,
  emote?: string,
): Promise<boolean> {
  return await updateQueueRole(queueId, roleId, mmrThreshold, emote)
}

import { deleteQueueRole } from "../../utils/queryDB";

/**
 * Deletes a queue rank role from a queue.
 *
 * @param {number} queueId - The unique identifier of the queue to delete the role from.
 * @param {string} roleId - The unique identifier of the role in discord.
 */
export async function addQueueRole(queueId: number, roleId: string): Promise<void> {
    await deleteQueueRole(queueId, roleId);
}

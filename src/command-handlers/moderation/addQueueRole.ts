import { createQueueRole } from "../../utils/queryDB";

/**
 * Creates and adds a queue rank role to a queue.
 *
 * @param {number} queueId - The unique identifier of the queue to add the role to.
 * @param {string} roleId - The unique identifier of the role in discord.
 * @param {number} mmrThreshold - The minimum amount of MMR required to gain this role in the queue.
 * @return {Promise<boolean>} A promise that resolves to true if the queue role was created and added, otherwise false.
 */
export async function addQueueRole(queueId: number, roleId: string, mmrThreshold: number): Promise<boolean> {
    const roleCheck = await createQueueRole(queueId, roleId, mmrThreshold);
    return roleCheck;
}

import { queueChangeLock } from "utils/queryDB";
import { updateQueueMessage } from "utils/queueHelpers";

/**
 * Sets a queue to locked.
 *
 * @param {number} queueId - The unique identifier of the queue to be locked.
 * @return {Promise<boolean>} A promise that resolves to true if the queue was successfully locked, otherwise false.
 */
export async function lockQueue(queueId: number): Promise<boolean> {
    const lockCheck = await queueChangeLock(queueId, true);
    if (lockCheck) await updateQueueMessage();
    return lockCheck
}

/**
 * Sets a queue to unlocked.
 *
 * @param {number} queueId - The unique identifier of the queue to be unlocked.
 * @return {Promise<boolean>} A promise that resolves to true if the queue was successfully unlocked, otherwise false.
 */
export async function unlockQueue(queueId: number): Promise<boolean> {
    const unlockCheck = await queueChangeLock(queueId, false);
    if (unlockCheck) await updateQueueMessage();
    return unlockCheck
}


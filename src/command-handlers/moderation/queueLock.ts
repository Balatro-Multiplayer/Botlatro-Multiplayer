import {
  clearQueueUsers,
  lockAllQueues,
  queueChangeLock,
  unlockAllQueues,
} from 'utils/queryDB'
import { updateQueueMessage } from 'utils/queueHelpers'

export async function lockQueue(queueId: number): Promise<boolean> {
  const lockCheck = await queueChangeLock(queueId, true)
  if (lockCheck) {
    await clearQueueUsers(queueId)
    await updateQueueMessage()
  }
  return lockCheck
}

export async function unlockQueue(queueId: number): Promise<boolean> {
  const unlockCheck = await queueChangeLock(queueId, false)
  if (unlockCheck) await updateQueueMessage()
  return unlockCheck
}

export async function lockAllQueuesHandler(): Promise<number> {
  const lockedIds = await lockAllQueues()
  await Promise.all(lockedIds.map((id) => clearQueueUsers(id)))
  if (lockedIds.length > 0) await updateQueueMessage(true)
  return lockedIds.length
}

export async function unlockAllQueuesHandler(): Promise<boolean> {
  const result = await unlockAllQueues()
  if (result) await updateQueueMessage(true)
  return result
}

import { logModerationEvent } from '../../utils/logModerationEvent'
import {
  clearQueueUsers,
  lockAllQueues,
  queueChangeLock,
  unlockAllQueues,
} from 'utils/queryDB'
import { updateQueueMessage } from 'utils/queueHelpers'

export async function lockQueue(
  queueId: number,
  moderatorId?: string,
): Promise<boolean> {
  const lockCheck = await queueChangeLock(queueId, true)
  if (lockCheck) {
    await clearQueueUsers(queueId)
    await updateQueueMessage()
    if (moderatorId) {
      await logModerationEvent({
        action: 'queue_lock',
        moderatorId,
        details: { queueId },
      })
    }
  }
  return lockCheck
}

export async function unlockQueue(
  queueId: number,
  moderatorId?: string,
): Promise<boolean> {
  const unlockCheck = await queueChangeLock(queueId, false)
  if (unlockCheck) {
    await updateQueueMessage()
    if (moderatorId) {
      await logModerationEvent({
        action: 'queue_unlock',
        moderatorId,
        details: { queueId },
      })
    }
  }
  return unlockCheck
}

export async function lockAllQueuesHandler(
  moderatorId?: string,
): Promise<number> {
  const lockedIds = await lockAllQueues()
  await Promise.all(lockedIds.map((id) => clearQueueUsers(id)))
  if (lockedIds.length > 0) {
    await updateQueueMessage(true)
    if (moderatorId) {
      await logModerationEvent({
        action: 'queue_lock_all',
        moderatorId,
        details: { queueIds: lockedIds, count: lockedIds.length },
      })
    }
  }
  return lockedIds.length
}

export async function unlockAllQueuesHandler(
  moderatorId?: string,
): Promise<boolean> {
  const result = await unlockAllQueues()
  if (result) {
    await updateQueueMessage(true)
    if (moderatorId) {
      await logModerationEvent({
        action: 'queue_unlock_all',
        moderatorId,
      })
    }
  }
  return result
}

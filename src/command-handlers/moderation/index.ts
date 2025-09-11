import { cancelMatch } from './cancelMatch'
import { lockQueue, unlockQueue } from './queueLock'

export const MODERATION_COMMAND_HANDLERS = {
  CANCEL_MATCH: cancelMatch,
  LOCK_QUEUE: lockQueue,
  UNLOCK_QUEUE: unlockQueue,
}

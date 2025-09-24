import { deleteQueueRole } from 'utils/queryDB'
import { addQueueRole } from './addQueueRole'
import { cancelMatch } from './cancelMatch'
import { lockQueue, unlockQueue } from './queueLock'
import { addLeaderboardRole } from './addLeaderboardRole'

export const MODERATION_COMMAND_HANDLERS = {
  CANCEL_MATCH: cancelMatch,
  LOCK_QUEUE: lockQueue,
  UNLOCK_QUEUE: unlockQueue,
  ADD_QUEUE_ROLE: addQueueRole,
  DELETE_QUEUE_ROLE: deleteQueueRole,
  ADD_LEADERBOARD_ROLE: addLeaderboardRole,
}

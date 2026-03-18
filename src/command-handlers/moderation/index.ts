import { deleteQueueRole } from 'utils/queryDB'
import { addQueueRole } from './addQueueRole'
import { cancelMatch } from './cancelMatch'
import {
  lockAllQueuesHandler,
  lockQueue,
  unlockAllQueuesHandler,
  unlockQueue,
} from './queueLock'
import { addLeaderboardRole } from './addLeaderboardRole'
import { editQueueRole } from './editQueueRole'
import { updateBan } from './updateBan'

export const MODERATION_COMMAND_HANDLERS = {
  CANCEL_MATCH: cancelMatch,
  LOCK_QUEUE: lockQueue,
  UNLOCK_QUEUE: unlockQueue,
  LOCK_ALL_QUEUES: lockAllQueuesHandler,
  UNLOCK_ALL_QUEUES: unlockAllQueuesHandler,
  ADD_QUEUE_ROLE: addQueueRole,
  EDIT_QUEUE_ROLE: editQueueRole,
  DELETE_QUEUE_ROLE: deleteQueueRole,
  ADD_LEADERBOARD_ROLE: addLeaderboardRole,
  UPDATE_BAN: updateBan,
}

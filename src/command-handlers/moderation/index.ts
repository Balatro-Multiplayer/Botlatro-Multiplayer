import { deleteQueueRole } from 'utils/queryDB'
import { addQueueRole } from './addQueueRole'
import { cancelMatch } from './cancelMatch'
import { cancelPlayerSeasonWins } from './cancelPlayerSeasonWins'
import { createBan } from './createBan'
import { createStrike } from './createStrike'
import {
  lockAllQueuesHandler,
  lockQueue,
  unlockAllQueuesHandler,
  unlockQueue,
} from './queueLock'
import { addLeaderboardRole } from './addLeaderboardRole'
import { editQueueRole } from './editQueueRole'
import { removeBan } from './removeBan'
import { removeStrike } from './removeStrike'
import { updateBan } from './updateBan'

export const MODERATION_COMMAND_HANDLERS = {
  CANCEL_MATCH: cancelMatch,
  CANCEL_PLAYER_SEASON_WINS: cancelPlayerSeasonWins,
  CREATE_BAN: createBan,
  CREATE_STRIKE: createStrike,
  REMOVE_BAN: removeBan,
  REMOVE_STRIKE: removeStrike,
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

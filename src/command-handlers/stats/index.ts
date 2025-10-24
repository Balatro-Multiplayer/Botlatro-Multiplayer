import { getPlayerStats } from './getPlayerStats'
import { getMatchHistory } from './getMatchHistory'
import { getLeaderboard } from './getLeaderboard'
import { getOverallHistory } from './getOverallHistory'

export const STATS_COMMAND_HANDLERS = {
  GET_PLAYER_STATS: getPlayerStats,
  GET_MATCH_HISTORY: getMatchHistory,
  GET_LEADERBOARD: getLeaderboard,
  GET_OVERALL_HISTORY: getOverallHistory,
}

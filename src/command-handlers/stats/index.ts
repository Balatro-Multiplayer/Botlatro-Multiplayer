import { getPlayerStats } from './getPlayerStats'
import { getMatchHistory } from './getMatchHistory'

export const STATS_COMMAND_HANDLERS = {
  GET_PLAYER_STATS: getPlayerStats,
  GET_MATCH_HISTORY: getMatchHistory,
}

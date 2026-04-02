import { logModerationEvent } from '../../utils/logModerationEvent'
import {
  EndMatchResult,
  endMatch,
  finalizeCancelledMatch as finalizeCancelledMatchState,
} from '../../utils/matchHelpers'

export async function cancelMatch(
  matchId: number,
  moderatorId?: string,
): Promise<EndMatchResult> {
  const result = await endMatch(matchId, true)
  if (result.success && moderatorId) {
    await logModerationEvent({
      action: 'match_cancel',
      moderatorId,
      details: {
        matchId,
        revertedMmrChanges: result.revertedMmrChanges,
      },
    })
  }
  return result
}

export async function finalizeCancelledMatch(
  matchId: number,
  moderatorId?: string,
): Promise<EndMatchResult> {
  const result = await finalizeCancelledMatchState(matchId)
  if (result.success && moderatorId) {
    await logModerationEvent({
      action: 'match_cancel',
      moderatorId,
      details: {
        matchId,
        revertedMmrChanges: [],
        finalizedOnly: true,
      },
    })
  }
  return result
}

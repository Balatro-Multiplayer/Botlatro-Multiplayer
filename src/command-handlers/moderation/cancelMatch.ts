import { logModerationEvent } from '../../utils/logModerationEvent'
import { EndMatchResult, endMatch } from '../../utils/matchHelpers'

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

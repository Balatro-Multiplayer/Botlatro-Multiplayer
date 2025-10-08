import {
  getQueueSettings,
  getMatchData,
  ratingUtils,
  getWinningTeamFromMatch,
  updatePlayerMmrAll,
} from '../queryDB'
import type { teamResults } from 'psqlDB'
import { setUserQueueRole } from 'utils/queueHelpers'

// Function is from Owen, named Elowen, blame him if anything goes wrong
// - Jeff
function calculateRatingChange(
  c_mmrchange: number,
  v_mmrvariance: number,
  m_losermrr: number,
  p_winnermrr: number,
  g_volatility: number,
): number {
  const numerator = 2 * c_mmrchange
  const exponent = (p_winnermrr - m_losermrr) / v_mmrvariance
  const denominator = 1 + Math.pow(10, exponent)

  // volatility factor
  const gMultiplier = 1.5 - g_volatility * 0.05

  return gMultiplier * (numerator / denominator)
}

export async function calculateNewMMR(
  queueId: number,
  matchId: number,
  teamResults: teamResults,
): Promise<teamResults> {
  const matchData = await getMatchData(matchId)
  const settings = await getQueueSettings(matchData.queue_id)
  const winningTeamId = await getWinningTeamFromMatch(matchId)

  // MMR formula constants
  const C_MMR_CHANGE = 25 // Base MMR change value
  const V_VARIANCE = 1200 // MMR variance

  // Calculate average MMR and volatility for each team
  const teamStats = teamResults.teams.map((team) => {
    const players = team.players
    const avgMMR =
      players.reduce((sum, p) => sum + (p.elo ?? settings.default_elo), 0) /
      players.length
    const avgVolatility =
      players.reduce((sum, p) => sum + (p.volatility ?? 10), 0) / players.length

    return {
      team,
      avgMMR,
      avgVolatility,
      isWinner: team.id === winningTeamId,
    }
  })

  // Find winner and calculate average MMR of all losing teams
  const winnerStats = teamStats.find((ts) => ts.isWinner)
  const loserStats = teamStats.filter((ts) => !ts.isWinner)

  if (!winnerStats || loserStats.length === 0) {
    throw new Error('Unable to determine winner and loser teams')
  }

  // Average MMR and volatility of all losing teams
  const avgLoserMMR =
    loserStats.reduce((sum, ts) => sum + ts.avgMMR, 0) / loserStats.length
  const avgLoserVolatility =
    loserStats.reduce((sum, ts) => sum + ts.avgVolatility, 0) /
    loserStats.length

  // Use overall average volatility for g factor
  const globalAvgVolatility = (winnerStats.avgVolatility + avgLoserVolatility) / 2

  // Calculate rating change using the formula
  const ratingChange = calculateRatingChange(
    C_MMR_CHANGE,
    V_VARIANCE,
    avgLoserMMR,
    winnerStats.avgMMR,
    globalAvgVolatility,
  )

  // Apply changes to all teams and players
  for (const ts of teamStats) {
    const isWinner = ts.isWinner
    const mmrChange = isWinner ? ratingChange : -ratingChange / loserStats.length

    for (const player of ts.team.players) {
      const oldMMR = player.elo ?? settings.default_elo
      const oldVolatility = player.volatility ?? 10

      const newMMR = parseFloat((oldMMR + mmrChange).toFixed(1))
      const newVolatility = Math.max(oldVolatility - 1, 1)

      // Update database
      await updatePlayerMmrAll(queueId, player.user_id, newMMR, newVolatility)

      // Update teamResults object
      player.elo = newMMR
      player.elo_change = parseFloat(mmrChange.toFixed(1))
      player.volatility = newVolatility

      // Set user queue role
      await setUserQueueRole(queueId, player.user_id)
    }

    // Set team score
    ts.team.score = isWinner ? 1 : 0
  }

  return teamResults
}

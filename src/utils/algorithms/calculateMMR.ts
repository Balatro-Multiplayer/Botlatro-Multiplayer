import {
  getQueueSettings,
  getUsersNeedingRoleUpdates,
  updatePlayerMmrAll,
  countPlayerGames,
} from '../queryDB'
import type { Queues, teamResults } from 'psqlDB'
import { setUserQueueRole } from 'utils/queueHelpers'
import { clamp } from 'lodash-es'

// MMR formula constants
const C_MMR_CHANGE = 25 // Base MMR change value
const V_VARIANCE = 1200 // MMR variance

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

// Helper function to calculate team statistics and MMR changes
async function calculateTeamStatsAndChanges(
  teamResults: teamResults,
  winningTeamId: number,
  defaultElo: number,
): Promise<{
  teamStats: Array<{
    team: teamResults['teams'][0]
    avgMMR: number
    avgVolatility: number
    isWinner: boolean
  }>
  ratingChange: number
  loserCount: number
}> {
  // Calculate average MMR and volatility for each team
  const teamStats = teamResults.teams.map((team) => {
    const players = team.players
    const avgMMR =
      players.reduce((sum, p) => sum + (p.elo ?? defaultElo), 0) /
      players.length
    const avgVolatility =
      players.reduce((sum, p) => sum + (p.volatility ?? 0), 0) / players.length

    return {
      team,
      avgMMR,
      avgVolatility,
      isWinner: team.id === winningTeamId,
    }
  })

  const winnerStats = teamStats.find((ts) => ts.isWinner)
  const loserStats = teamStats.filter((ts) => !ts.isWinner)

  if (!winnerStats || loserStats.length === 0) {
    throw new Error('Invalid team stats: no winner or losers found')
  }

  const avgLoserMMR =
    loserStats.reduce((sum, ts) => sum + ts.avgMMR, 0) / loserStats.length
  const avgLoserVolatility =
    loserStats.reduce((sum, ts) => sum + ts.avgVolatility, 0) /
    loserStats.length

  const globalAvgVolatility =
    (winnerStats.avgVolatility + avgLoserVolatility) / 2

  const ratingChange = calculateRatingChange(
    C_MMR_CHANGE,
    V_VARIANCE,
    avgLoserMMR,
    winnerStats.avgMMR,
    globalAvgVolatility,
  )

  return {
    teamStats,
    ratingChange,
    loserCount: loserStats.length,
  }
}

// Calculate predicted MMR changes for each team without updating the database
export async function calculatePredictedMMR(
  queueId: number,
  teamResults: teamResults,
  winningTeamId: number,
): Promise<Map<string, number>> {
  const settings = await getQueueSettings(queueId)

  try {
    const { teamStats, ratingChange, loserCount } =
      await calculateTeamStatsAndChanges(
        teamResults,
        winningTeamId,
        settings.default_elo,
      )

    // Build map of user_id -> predicted MMR change
    const predictions = new Map<string, number>()

    for (const ts of teamStats) {
      const isWinner = ts.isWinner
      const mmrChange = isWinner ? ratingChange : -ratingChange / loserCount

      for (const player of ts.team.players) {
        predictions.set(player.user_id, parseFloat(mmrChange.toFixed(1)))
      }
    }

    return predictions
  } catch (err) {
    console.error('Error calculating predicted MMR:', err)
    return new Map()
  }
}

export async function calculateNewMMR(
  queueId: number,
  queueSettings: Queues,
  teamResults: teamResults,
  winningTeamId: number,
): Promise<teamResults> {
  try {
    const { teamStats, ratingChange, loserCount } =
      await calculateTeamStatsAndChanges(
        teamResults,
        winningTeamId,
        queueSettings.default_elo,
      )

    const playerMMRChanges: Array<{
      user_id: string
      oldMMR: number
      newMMR: number
    }> = []
    const updatePromises: Promise<void>[] = []
    let roleUpdateUsers: string[] = []

    for (const ts of teamStats) {
      const isWinner = ts.isWinner
      const mmrChange = isWinner ? ratingChange : -ratingChange / loserCount

      for (const player of ts.team.players) {
        const oldMMR = player.elo ?? queueSettings.default_elo
        const oldVolatility = player.volatility ?? 0

        const newMMR = parseFloat((oldMMR + mmrChange).toFixed(1))
        const newVolatility = Math.min(oldVolatility + 1, 10)

        playerMMRChanges.push({
          user_id: player.user_id,
          oldMMR,
          newMMR,
        })

        player.elo = clamp(newMMR, 0, 9999)
        player.elo_change = parseFloat(mmrChange.toFixed(1))
        player.volatility = newVolatility

        updatePromises.push(
          updatePlayerMmrAll(queueId, player.user_id, newMMR, newVolatility),
        )

        const gamesPlayed = await countPlayerGames(queueId, player.user_id)
        if (gamesPlayed === 1) {
          roleUpdateUsers.push(player.user_id)
        }
      }

      ts.team.score = isWinner ? 1 : 0
    }

    await Promise.all(updatePromises)

    // Get users who need role updates due to MMR threshold changes
    let usersNeedingRoleUpdate = await getUsersNeedingRoleUpdates(
      queueId,
      playerMMRChanges,
    )

    roleUpdateUsers = roleUpdateUsers.concat(usersNeedingRoleUpdate).flat()

    if (roleUpdateUsers.length > 0) {
      await Promise.all(
        roleUpdateUsers.map((userId) => setUserQueueRole(queueId, userId)),
      )
    }

    return teamResults
  } catch (err) {
    console.error('Error calculating new MMR:', err)
    return teamResults
  }
}

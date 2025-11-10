import { teamResults } from 'psqlDB'
import { db } from '../db'

export interface MatchEndWebhookPayload {
  matchId: number
  queueId: number
  queueName: string
  createdAt: Date
  completedAt: Date
  cancelled: boolean
  winningTeam: number | null
  deck: string | null
  stake: string | null
  bestOf3: boolean
  bestOf5: boolean
  teams: {
    teamId: number
    score: number
    players: {
      userId: string
      newMMR: number
      mmrDelta: number
      team: number
      wins: number
      losses: number
    }[]
  }[]
}

/**
 * Sends a webhook notification when a match ends
 * @param matchId The ID of the match that ended
 * @param queueId The ID of the queue
 * @param queueName The name of the queue
 * @param teamResults The results of the match including player MMR changes
 * @param cancelled Whether the match was cancelled
 * @returns Promise<boolean> indicating success or failure
 */
export async function sendMatchEndWebhook(
  matchId: number,
  queueId: number,
  queueName: string,
  teamResults: teamResults,
  cancelled: boolean = false
): Promise<boolean> {
  try {
    // Get webhook URL from settings
    const settings = await db.query<{ webhook_url: string | null }>(
      'SELECT webhook_url FROM settings WHERE singleton = true LIMIT 1'
    )

    const webhookUrl = settings.rows[0]?.webhook_url

    // If no webhook URL is configured, skip silently
    if (!webhookUrl) {
      return true
    }

    // Get match details
    const matchData = await db.query(
      `SELECT created_at, winning_team, deck, stake, best_of_3, best_of_5
       FROM matches
       WHERE id = $1`,
      [matchId]
    )

    if (matchData.rows.length === 0) {
      console.error(`Match ${matchId} not found for webhook`)
      return false
    }

    const match = matchData.rows[0]

    // Build webhook payload
    const payload: MatchEndWebhookPayload = {
      matchId,
      queueId,
      queueName,
      createdAt: match.created_at,
      completedAt: new Date(),
      cancelled,
      winningTeam: match.winning_team,
      deck: match.deck,
      stake: match.stake,
      bestOf3: match.best_of_3,
      bestOf5: match.best_of_5,
      teams: teamResults.teams.map((team) => ({
        teamId: team.id,
        score: team.score,
        players: team.players.map((player) => ({
          userId: player.user_id,
          newMMR: player.elo || 0,
          mmrDelta: player.elo_change || 0,
          team: player.team || 0,
          wins: player.wins,
          losses: player.losses,
        })),
      })),
    }

    // Send webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error(
        `Webhook failed for match ${matchId}: ${response.status} ${response.statusText}`
      )
      return false
    }

    console.log(`Webhook sent successfully for match ${matchId}`)
    return true
  } catch (err) {
    console.error(`Error sending webhook for match ${matchId}:`, err)
    return false
  }
}

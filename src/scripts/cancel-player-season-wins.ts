import '../register-paths'
import { once } from 'node:events'
import { pool } from '../db'
import { client } from '../client'
import { env } from '../env'
import { cancelMatch } from '../command-handlers/moderation/cancelMatch'
import { formatCancelledMatchResult } from '../utils/matchHelpers'
import { getActiveSeason } from '../utils/queryDB'

type WonMatchRow = {
  match_id: number
  queue_id: number
  queue_name: string | null
  created_at: Date
}

async function waitForClientReady() {
  if (client.isReady()) return

  const readyPromise = once(client, 'ready')
  await client.login(env.DISCORD_TOKEN)
  await readyPromise
}

async function getWonMatchesForSeason(
  playerId: string,
  season: number,
): Promise<WonMatchRow[]> {
  const result = await pool.query<WonMatchRow>(
    `
      SELECT DISTINCT
        m.id AS match_id,
        m.queue_id,
        q.queue_name,
        m.created_at
      FROM matches m
      JOIN match_users mu ON mu.match_id = m.id
      LEFT JOIN queues q ON q.id = m.queue_id
      WHERE mu.user_id = $1
        AND m.season = $2
        AND m.winning_team IS NOT NULL
        AND m.winning_team = mu.team
      ORDER BY m.created_at DESC, m.id DESC
    `,
    [playerId, season],
  )

  return result.rows
}

async function cleanup() {
  if (client.isReady()) {
    client.destroy()
  }

  await pool.end()
}

async function main() {
  const playerId = process.argv[2]?.trim()

  if (!playerId) {
    console.error(
      'Usage: bun run cancel-player-season-wins -- <player-id>',
    )
    await cleanup()
    process.exit(1)
  }

  try {
    await waitForClientReady()

    const season = await getActiveSeason()
    const matches = await getWonMatchesForSeason(playerId, season)

    console.log(
      `Player ${playerId} has ${matches.length} win(s) in current season ${season}`,
    )

    if (matches.length === 0) {
      await cleanup()
      process.exit(0)
    }

    let successCount = 0
    let failureCount = 0
    let revertedPlayerChanges = 0

    for (const [index, match] of matches.entries()) {
      const queueLabel = match.queue_name ?? `Queue ${match.queue_id}`
      console.log(
        `\n[${index + 1}/${matches.length}] Cancelling match ${match.match_id} (${queueLabel})`,
      )

      try {
        const result = await cancelMatch(match.match_id)

        if (!result.success) {
          failureCount++
          console.log(`Failed to cancel match ${match.match_id}.`)
          continue
        }

        successCount++
        revertedPlayerChanges += result.revertedMmrChanges.length
        console.log(formatCancelledMatchResult(match.match_id, result))
      } catch (error) {
        failureCount++
        console.error(`Failed to cancel match ${match.match_id}:`, error)
      }
    }

    // deleteMatchChannel uses a 1s timer internally
    await new Promise((resolve) => setTimeout(resolve, 2500))

    console.log('\nSummary')
    console.log(`Season: ${season}`)
    console.log(`Player: ${playerId}`)
    console.log(`Wins found: ${matches.length}`)
    console.log(`Matches cancelled: ${successCount}`)
    console.log(`Failures: ${failureCount}`)
    console.log(`Reverted MMR entries: ${revertedPlayerChanges}`)

    await cleanup()
    process.exit(failureCount === 0 ? 0 : 1)
  } catch (error) {
    console.error('Fatal error cancelling player season wins:', error)
    await cleanup()
    process.exit(1)
  }
}

main()

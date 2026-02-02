import { pool } from '../db'
import path from 'node:path'
import fs from 'fs/promises'

// retrieve a match transcript for a specific match given a match id
export async function getMatchTranscript(
  matchId: number,
): Promise<{ matchId: number; transcript: string } | void> {
  // get the channelId from the matchId
  const match = await pool.query(
    `
      SELECT channel_id FROM matches WHERE id = $1
    `,
    [matchId],
  )

  if (!match.rows.length) {
    return console.error('Match not found.')
  }

  const channelId = String(match.rows[0].channel_id)

  const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs')

  // iterate over log directory
  async function walk(dir: string): Promise<string | null> {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isFile()) {
        if (entry.name.includes(channelId)) {
          return fullPath
        }
      } else if (entry.isDirectory()) {
        // fallback for nested directories in case this somehow happens
        const found = await walk(fullPath)
        if (found) return found
      }
    }

    return null
  }

  const logFile = await walk(logDir)

  if (!logFile) {
    return console.error('Transcript not found.')
  }

  return {
    matchId: matchId,
    transcript: await fs.readFile(logFile, 'utf8'),
  }
}

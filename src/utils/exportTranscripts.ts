import { pool } from '../db'
import path from 'node:path'
import fs from 'fs/promises'
import { createTranscript, ExportReturnType } from 'discord-html-transcripts'
import { TextChannel } from 'discord.js'

/**
 * Generate an HTML transcript from a Discord text channel and store it in the database
 * @param matchId - The match ID to associate with the transcript
 * @param channel - The Discord text channel to generate transcript from
 * @returns The generated HTML string, or null if failed
 */
export async function generateAndStoreHtmlTranscript(
  matchId: number,
  channel: TextChannel,
): Promise<string | null> {
  try {
    // Generate HTML transcript using discord-html-transcripts
    const transcript = await createTranscript(channel, {
      returnType: ExportReturnType.String,
      filename: `match-${matchId}-transcript.html`,
      poweredBy: false,
      footerText: `Match #${matchId} Transcript`,
    })

    // Encode as base64 before storing
    const base64Transcript = Buffer.from(transcript).toString('base64')

    // Store in database
    await pool.query(
      `UPDATE matches SET transcript_html = $1 WHERE id = $2`,
      [base64Transcript, matchId],
    )

    console.log(`Generated and stored HTML transcript for match ${matchId}`)
    return transcript as string
  } catch (err) {
    console.error(`Failed to generate HTML transcript for match ${matchId}:`, err)
    return null
  }
}

/**
 * Retrieve the HTML transcript for a match from the database
 * @param matchId - The match ID
 * @returns The HTML transcript string (decoded from base64), or null if not found
 */
export async function getMatchHtmlTranscript(
  matchId: number,
): Promise<string | null> {
  const result = await pool.query(
    `SELECT transcript_html FROM matches WHERE id = $1`,
    [matchId],
  )

  if (!result.rows.length || !result.rows[0].transcript_html) {
    return null
  }

  // Decode from base64
  return Buffer.from(result.rows[0].transcript_html, 'base64').toString('utf-8')
}

// retrieve a match transcript for a specific match given a match id
export async function getMatchTranscript(
  matchId: number,
): Promise<{ matchId: number; transcript: string } | void> {
  console.log(`transcript fetch triggered for matchId: ${matchId}`)
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
  console.log(`channelId: ${channelId}`)

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

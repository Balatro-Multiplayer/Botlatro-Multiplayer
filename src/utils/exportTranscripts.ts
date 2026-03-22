import { pool } from '../db'
import path from 'node:path'
import fs from 'fs/promises'
import { createTranscript, ExportReturnType } from 'discord-html-transcripts'
import { TextChannel } from 'discord.js'
import { env } from '../env'
import {
  upsertTranscriptLobbyCodesFromMessages,
  upsertTranscriptLobbyCodesFromTextTranscript,
} from './transcriptLobbyCodes'

async function fetchUserMessageContents(
  channel: TextChannel,
): Promise<string[]> {
  const contents: string[] = []
  let before: string | undefined

  while (true) {
    const messages = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    })

    if (messages.size === 0) {
      break
    }

    for (const message of messages.values()) {
      if (message.author?.bot) continue
      if (!message.content?.trim()) continue
      contents.push(message.content)
    }

    before = messages.lastKey()

    if (messages.size < 100 || !before) {
      break
    }
  }

  return contents
}

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
    try {
      const messageContents = await fetchUserMessageContents(channel)
      const lobbyCodes = await upsertTranscriptLobbyCodesFromMessages(
        matchId,
        messageContents,
      )
      console.log(
        `Stored ${lobbyCodes.length} transcript lobby code(s) for match ${matchId}`,
      )
    } catch (error) {
      console.error(
        `Failed to extract transcript lobby codes for match ${matchId}:`,
        error,
      )
    }

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
    await pool.query(`UPDATE matches SET transcript_html = $1 WHERE id = $2`, [
      base64Transcript,
      matchId,
    ])

    console.log(`Generated and stored HTML transcript for match ${matchId}`)
    return transcript as string
  } catch (err) {
    console.error(
      `Failed to generate HTML transcript for match ${matchId}:`,
      err,
    )
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

  const logDir = env.LOG_DIR

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

  const transcript = await fs.readFile(logFile, 'utf8')

  try {
    const lobbyCodes = await upsertTranscriptLobbyCodesFromTextTranscript(
      matchId,
      transcript,
    )
    console.log(
      `Indexed ${lobbyCodes.length} transcript lobby code(s) from text log for match ${matchId}`,
    )
  } catch (error) {
    console.error(
      `Failed to index transcript lobby codes from text log for match ${matchId}:`,
      error,
    )
  }

  return {
    matchId: matchId,
    transcript,
  }
}

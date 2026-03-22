import '../register-paths'
import { pool } from '../db'
import { upsertTranscriptLobbyCodesFromHtmlTranscript } from '../utils/transcriptLobbyCodes'

type MatchTranscriptRow = {
  id: number
  transcript_html: string | null
}

async function backfillTranscriptLobbyCodes() {
  const forceAll = process.argv.includes('--all')

  try {
    console.log(
      `Starting transcript lobby code backfill${forceAll ? ' for all HTML transcripts' : ''}...`,
    )

    const result = await pool.query<MatchTranscriptRow>(
      `
        SELECT m.id, m.transcript_html
        FROM matches m
        WHERE m.transcript_html IS NOT NULL
          AND (
            $1::boolean = true
            OR NOT EXISTS (
              SELECT 1
              FROM match_transcript_lobby_codes mtlc
              WHERE mtlc.match_id = m.id
            )
          )
        ORDER BY m.id ASC
      `,
      [forceAll],
    )

    console.log(`Found ${result.rows.length} transcript(s) to backfill`)

    let successCount = 0
    let errorCount = 0
    let indexedCodeCount = 0

    for (const row of result.rows) {
      if (!row.transcript_html) continue

      try {
        const html = Buffer.from(row.transcript_html, 'base64').toString('utf8')
        const lobbyCodes = await upsertTranscriptLobbyCodesFromHtmlTranscript(
          row.id,
          html,
        )

        indexedCodeCount += lobbyCodes.length
        successCount += 1

        console.log(
          `✓ match ${row.id}: ${lobbyCodes.length} code(s)${lobbyCodes.length ? ` [${lobbyCodes.join(', ')}]` : ''}`,
        )
      } catch (error) {
        errorCount += 1
        console.error(`✗ match ${row.id}:`, error)
      }
    }

    console.log('\nBackfill complete!')
    console.log(`Processed: ${result.rows.length}`)
    console.log(`Succeeded: ${successCount}`)
    console.log(`Errors: ${errorCount}`)
    console.log(`Indexed codes: ${indexedCodeCount}`)

    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('Fatal error during transcript lobby code backfill:', error)
    await pool.end()
    process.exit(1)
  }
}

void backfillTranscriptLobbyCodes()

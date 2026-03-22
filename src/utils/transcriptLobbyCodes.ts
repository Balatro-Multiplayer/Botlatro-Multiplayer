import { pool } from '../db'

const LOBBY_CODE_LENGTH = 5
const LOBBY_CODE_PATTERN = /^[A-Z]{5}$/
const MAX_SEARCH_LIMIT = 100

const CONTEXTUAL_CODE_PATTERNS = [
  /\b(?:lobby|room|join|invite|connect)\s*code\b[^A-Za-z]*([A-Za-z][^A-Za-z]*[A-Za-z][^A-Za-z]*[A-Za-z][^A-Za-z]*[A-Za-z][^A-Za-z]*[A-Za-z])\b/gi,
  /\bcode\b[^A-Za-z]*([A-Za-z][^A-Za-z]*[A-Za-z][^A-Za-z]*[A-Za-z][^A-Za-z]*[A-Za-z][^A-Za-z]*[A-Za-z])\b/gi,
]

const STANDALONE_UPPERCASE_CODE_PATTERN = /\b([A-Z]{5})\b/g

type HtmlRewriterTextChunk = {
  text: string
}

type HtmlRewriterHandler = {
  element?: (_element: unknown) => void
  text?: (text: HtmlRewriterTextChunk) => void
}

type HtmlRewriterInstance = {
  on: (selector: string, handlers: HtmlRewriterHandler) => HtmlRewriterInstance
  transform: (response: Response) => Response
}

type HtmlRewriterConstructor = new () => HtmlRewriterInstance

function normalizeLobbyCodeLikeMod(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, LOBBY_CODE_LENGTH)
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort()
}

function getHtmlRewriter(): HtmlRewriterConstructor | null {
  return (
    (
      globalThis as typeof globalThis & {
        HTMLRewriter?: HtmlRewriterConstructor
      }
    ).HTMLRewriter ?? null
  )
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function extractMessageTextsFromHtmlTranscriptWithRegex(
  html: string,
): string[] {
  const blocks =
    html.match(/<discord-message\b[\s\S]*?<\/discord-message>/gi) ?? []

  return blocks
    .map((block) =>
      block
        .replace(/<discord-attachments[\s\S]*?<\/discord-attachments>/gi, ' ')
        .replace(/<discord-embed[\s\S]*?<\/discord-embed>/gi, ' ')
        .replace(/<discord-reactions[\s\S]*?<\/discord-reactions>/gi, ' ')
        .replace(/<discord-reply[\s\S]*?<\/discord-reply>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    )
    .map((block) => normalizeWhitespace(decodeHtmlEntities(block)))
    .filter(Boolean)
}

async function extractMessageTextsFromHtmlTranscript(
  html: string,
): Promise<string[]> {
  const HtmlRewriter = getHtmlRewriter()

  if (!HtmlRewriter) {
    return extractMessageTextsFromHtmlTranscriptWithRegex(html)
  }

  const messages: string[] = []
  let currentMessageIndex = -1

  const rewritten = new HtmlRewriter().on('discord-message', {
    element() {
      currentMessageIndex += 1
      messages.push('')
    },
    text(text) {
      if (currentMessageIndex < 0) return
      messages[currentMessageIndex] += text.text
    },
  })

  await rewritten.transform(new Response(html)).text()

  const normalizedMessages = messages
    .map((message) => normalizeWhitespace(decodeHtmlEntities(message)))
    .filter(Boolean)

  if (normalizedMessages.length > 0) {
    return normalizedMessages
  }

  return extractMessageTextsFromHtmlTranscriptWithRegex(html)
}

export function normalizeLobbyCodeSearchQuery(rawQuery: string): {
  normalizedQuery: string
  mode: 'exact' | 'prefix'
} {
  const normalizedQuery = normalizeLobbyCodeLikeMod(rawQuery)

  return {
    normalizedQuery,
    mode: normalizedQuery.length >= LOBBY_CODE_LENGTH ? 'exact' : 'prefix',
  }
}

export function extractPotentialLobbyCodesFromMessage(
  content: string,
): string[] {
  const trimmed = content.trim()
  if (!trimmed) return []

  const codes = new Set<string>()

  for (const pattern of CONTEXTUAL_CODE_PATTERNS) {
    pattern.lastIndex = 0

    for (const match of trimmed.matchAll(pattern)) {
      const normalized = normalizeLobbyCodeLikeMod(match[1] ?? '')
      if (LOBBY_CODE_PATTERN.test(normalized)) {
        codes.add(normalized)
      }
    }
  }

  STANDALONE_UPPERCASE_CODE_PATTERN.lastIndex = 0
  for (const match of trimmed.matchAll(STANDALONE_UPPERCASE_CODE_PATTERN)) {
    const normalized = normalizeLobbyCodeLikeMod(match[1] ?? '')
    if (LOBBY_CODE_PATTERN.test(normalized)) {
      codes.add(normalized)
    }
  }

  return uniqueSorted(codes)
}

export function extractPotentialLobbyCodesFromMessages(
  messages: Iterable<string>,
): string[] {
  const codes = new Set<string>()

  for (const message of messages) {
    for (const code of extractPotentialLobbyCodesFromMessage(message)) {
      codes.add(code)
    }
  }

  return uniqueSorted(codes)
}

export async function replaceMatchTranscriptLobbyCodes(
  matchId: number,
  lobbyCodes: string[],
): Promise<void> {
  const normalizedCodes = uniqueSorted(
    lobbyCodes
      .map((code) => normalizeLobbyCodeLikeMod(code))
      .filter((code) => LOBBY_CODE_PATTERN.test(code)),
  )

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(
      'DELETE FROM match_transcript_lobby_codes WHERE match_id = $1',
      [matchId],
    )

    if (normalizedCodes.length > 0) {
      const placeholders = normalizedCodes
        .map((_, index) => `($1, $${index + 2})`)
        .join(', ')

      await client.query(
        `INSERT INTO match_transcript_lobby_codes (match_id, lobby_code) VALUES ${placeholders}`,
        [matchId, ...normalizedCodes],
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function upsertTranscriptLobbyCodesFromMessages(
  matchId: number,
  messages: Iterable<string>,
): Promise<string[]> {
  const codes = extractPotentialLobbyCodesFromMessages(messages)
  await replaceMatchTranscriptLobbyCodes(matchId, codes)
  return codes
}

export async function upsertTranscriptLobbyCodesFromTextTranscript(
  matchId: number,
  transcript: string,
): Promise<string[]> {
  const lines = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(.*?)]\s+([^:]+):\s+(.*)$/)
      return match?.[3] ?? line
    })

  return upsertTranscriptLobbyCodesFromMessages(matchId, lines)
}

export async function upsertTranscriptLobbyCodesFromHtmlTranscript(
  matchId: number,
  html: string,
): Promise<string[]> {
  const messages = await extractMessageTextsFromHtmlTranscript(html)
  return upsertTranscriptLobbyCodesFromMessages(matchId, messages)
}

type TranscriptLobbyCodeSearchResultRow = {
  match_id: number
  created_at: Date
  queue_name: string | null
  matched_codes: string[] | null
  lobby_codes: string[] | null
}

export type TranscriptLobbyCodeSearchResult = {
  match_id: number
  created_at: string
  queue_name: string | null
  matched_codes: string[]
  lobby_codes: string[]
}

export async function searchTranscriptLobbyCodes(
  rawQuery: string,
  limit = 50,
): Promise<{
  normalizedQuery: string
  mode: 'exact' | 'prefix'
  results: TranscriptLobbyCodeSearchResult[]
}> {
  const { normalizedQuery, mode } = normalizeLobbyCodeSearchQuery(rawQuery)

  if (!normalizedQuery) {
    return {
      normalizedQuery,
      mode,
      results: [],
    }
  }

  const cappedLimit = Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT))
  const searchValue = mode === 'exact' ? normalizedQuery : `${normalizedQuery}%`

  const result = await pool.query<TranscriptLobbyCodeSearchResultRow>(
    `
      SELECT
        m.id AS match_id,
        m.created_at,
        q.queue_name,
        ARRAY_AGG(DISTINCT filtered.lobby_code ORDER BY filtered.lobby_code) AS matched_codes,
        ARRAY_AGG(DISTINCT all_codes.lobby_code ORDER BY all_codes.lobby_code) AS lobby_codes
      FROM matches m
      JOIN match_transcript_lobby_codes filtered
        ON filtered.match_id = m.id
      LEFT JOIN match_transcript_lobby_codes all_codes
        ON all_codes.match_id = m.id
      LEFT JOIN queues q
        ON q.id = m.queue_id
      WHERE filtered.lobby_code ${mode === 'exact' ? '= $1' : 'LIKE $1'}
      GROUP BY m.id, m.created_at, q.queue_name
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $2
    `,
    [searchValue, cappedLimit],
  )

  return {
    normalizedQuery,
    mode,
    results: result.rows.map((row) => ({
      match_id: row.match_id,
      created_at: row.created_at.toISOString(),
      queue_name: row.queue_name,
      matched_codes: row.matched_codes ?? [],
      lobby_codes: row.lobby_codes ?? [],
    })),
  }
}

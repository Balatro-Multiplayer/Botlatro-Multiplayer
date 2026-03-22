import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  getMatchTranscript,
  getMatchHtmlTranscript,
} from '../../../utils/exportTranscripts'
import { searchTranscriptLobbyCodes } from '../../../utils/transcriptLobbyCodes'

const transcriptsRouter = new OpenAPIHono()

// Get transcript - returns HTML if available, falls back to text log file
transcriptsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/view/{matchId}',
    description:
      'Get the transcript for a match. Returns HTML if available, otherwise falls back to legacy text log.',
    request: {
      params: z.object({
        matchId: z.coerce.number().openapi({
          param: {
            name: 'matchId',
            in: 'path',
          },
          example: 301808,
        }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              transcript: z.string(),
            }),
          },
        },
        description: 'Transcript returned successfully.',
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.string(),
            }),
          },
        },
        description: 'Transcript not found.',
      },
    },
  }),
  async (c) => {
    const { matchId } = c.req.valid('param')

    // Try HTML transcript first
    const html = await getMatchHtmlTranscript(matchId)
    if (html) {
      return c.json(
        {
          success: true as const,
          transcript: html,
        },
        200,
      )
    }

    // Fall back to legacy text log
    const textLog = await getMatchTranscript(matchId)
    if (textLog) {
      return c.json(
        {
          success: true as const,
          transcript: textLog.transcript,
        },
        200,
      )
    }

    return c.json(
      {
        success: false as const,
        error: 'Transcript not found for this match.',
      },
      404,
    )
  },
)

transcriptsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/lobby-codes/search',
    description:
      'Search normalized transcript lobby codes extracted from match transcripts.',
    request: {
      query: z.object({
        query: z.string().min(1).openapi({
          example: 'abcde',
        }),
        limit: z.coerce.number().int().min(1).max(100).default(50).openapi({
          example: 25,
        }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              normalized_query: z.string(),
              mode: z.enum(['exact', 'prefix']),
              results: z.array(
                z.object({
                  match_id: z.number(),
                  created_at: z.string(),
                  queue_name: z.string().nullable(),
                  matched_codes: z.array(z.string()),
                  lobby_codes: z.array(z.string()),
                  players: z.array(
                    z.object({
                      user_id: z.string(),
                      display_name: z.string().nullable(),
                      team: z.number().nullable(),
                    }),
                  ),
                }),
              ),
            }),
          },
        },
        description: 'Transcript lobby code results returned successfully.',
      },
    },
  }),
  async (c) => {
    const { query, limit } = c.req.valid('query')
    const results = await searchTranscriptLobbyCodes(query, limit)

    return c.json(
      {
        success: true as const,
        normalized_query: results.normalizedQuery,
        mode: results.mode,
        results: results.results,
      },
      200,
    )
  },
)

export { transcriptsRouter }

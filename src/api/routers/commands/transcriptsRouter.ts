import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  getMatchTranscript,
  getMatchHtmlTranscript,
} from '../../../utils/exportTranscripts'

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

export { transcriptsRouter }

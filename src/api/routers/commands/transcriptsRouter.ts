import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getMatchTranscript } from '../../../utils/exportTranscripts'

const transcriptsRouter = new OpenAPIHono()

transcriptsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/transcript/{matchId}',
    description: 'Get the transcript for a match.',
    request: {
      params: z.object({
        matchId: z.number().openapi({
          param: {
            name: 'matchId',
            in: 'path',
          },
          example: '1212121',
        }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
            }),
          },
        },
        description: 'Match transcript sent successfully.',
      },
    },
  }),
  async (c) => {
    const { matchId } = c.req.valid('param')

    const res = await getMatchTranscript(matchId)
    if (res) {
      return c.json(
        {
          success: true as const,
          transcript: res.transcript,
        },
        200,
      )
    }
    return c.json(
      {
        success: false as const,
      },
      200,
    )
  },
)

export { transcriptsRouter }

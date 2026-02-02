import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { COMMAND_HANDLERS } from '../../../command-handlers'

const logsRouter = new OpenAPIHono()

logsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/log/{id}',
    description: 'Get the transcript for a match.',
    request: {
      params: z.object({
        id: z.number().openapi({
          param: {
            name: 'id',
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
    const { id } = c.req.valid('param')
    // todo: add error handling
    const success = await COMMAND_HANDLERS.STATS.GET_MATCH_LOGS(id)
    if (success) {
      return c.json(
        {
          success: true as const,
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

export { logsRouter }

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { COMMAND_HANDLERS } from '../../../command-handlers'

const matchesRouter = new OpenAPIHono()

matchesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/lock/{id}',
    description: 'Lock a queue.',
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
        description: 'Queue locked successfully.',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    //todo: add error handling
    const success = await COMMAND_HANDLERS.MODERATION.CANCEL_MATCH(id)
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

export { matchesRouter }

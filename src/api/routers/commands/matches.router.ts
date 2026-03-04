import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { getActiveMatchCountsByQueue } from '../../../utils/queryDB'

const matchesRouter = new OpenAPIHono()

matchesRouter.openapi(
  createRoute({
    method: 'get',
    path: '/active-counts',
    description: 'Get the number of active matches per queue.',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              queues: z.array(
                z.object({
                  queue_id: z.number(),
                  queue_name: z.string(),
                  active_matches: z.number(),
                  players_in_queue: z.number(),
                }),
              ),
            }),
          },
        },
        description: 'Active match counts retrieved successfully.',
      },
      500: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    try {
      const queues = await getActiveMatchCountsByQueue()
      return c.json({ queues }, 200)
    } catch (error) {
      console.error('Error fetching active match counts:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

matchesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/cancel/{id}',
    description: 'Cancel an ongoing match.',
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
        description: 'Match cancelled successfully.',
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

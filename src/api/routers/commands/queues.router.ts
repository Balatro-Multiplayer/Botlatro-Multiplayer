import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { COMMAND_HANDLERS } from '../../../command-handlers'

const queuesRouter = new OpenAPIHono()

queuesRouter.openapi(
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
    const success = await COMMAND_HANDLERS.MODERATION.LOCK_QUEUE(id)
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

queuesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/unlock/{id}',
    description: 'Unlock a queue.',
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
        description: 'Queue unlocked successfully.',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    //todo: add error handling
    const success = await COMMAND_HANDLERS.MODERATION.UNLOCK_QUEUE(id)
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

queuesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/roles/{id}',
    description: 'Create and add a queue role.',
    request: {
      params: z.object({
        id: z.number().openapi({
          param: {
            name: 'id',
            in: 'path',
          },
          example: '1212121',
        }),
        role_id: z.string().openapi({
          param: {
            name: 'role_id',
            in: 'path',
          },
          example: '1212121',
        }),
        mmr_threshold: z.number().openapi({
          param: {
            name: 'mmr_threshold',
            in: 'path',
          },
          example: '1212121',
        }),
        emote: z.string().openapi({
          param: {
            name: 'emote',
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
        description: 'Queue role created and added successfully.',
      },
    },
  }),
  async (c) => {
    const { id, role_id, mmr_threshold, emote } = c.req.valid('param')
    //todo: add error handling
    const success = await COMMAND_HANDLERS.MODERATION.ADD_QUEUE_ROLE(
      id,
      role_id,
      mmr_threshold,
      emote,
    )
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

queuesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/roles/leaderboard/{id}',
    description: 'Create and add a leaderboard queue role.',
    request: {
      params: z.object({
        id: z.number().openapi({
          param: {
            name: 'id',
            in: 'path',
          },
          example: '1212121',
        }),
        role_id: z.string().openapi({
          param: {
            name: 'role_id',
            in: 'path',
          },
          example: '1212121',
        }),
        leaderboard_min: z.number().openapi({
          param: {
            name: 'leaderboard_min',
            in: 'path',
          },
          example: '1212121',
        }),
        leaderboard_max: z.number().openapi({
          param: {
            name: 'leaderboard_max',
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
        description: 'Leaderboard role created and added successfully.',
      },
    },
  }),
  async (c) => {
    const { id, role_id, leaderboard_min, leaderboard_max } =
      c.req.valid('param')
    //todo: add error handling
    const success = await COMMAND_HANDLERS.MODERATION.ADD_LEADERBOARD_ROLE(
      id,
      role_id,
      leaderboard_min,
      leaderboard_max,
    )
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

export { queuesRouter }

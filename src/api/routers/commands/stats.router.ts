import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { COMMAND_HANDLERS } from '../../../command-handlers'

const statsRouter = new OpenAPIHono()

statsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/leaderboard/{queue_id}',
    description: 'Get leaderboard for a specific queue.',
    request: {
      params: z.object({
        queue_id: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .openapi({
            param: {
              name: 'queue_id',
              in: 'path',
            },
            example: '1',
          }),
      }),
      query: z.object({
        limit: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .optional()
          .openapi({
            param: {
              name: 'limit',
              in: 'query',
            },
            example: '100',
          }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              leaderboard: z.array(
                z.object({
                  rank: z.number(),
                  id: z.string(),
                  name: z.string().nullable(),
                  mmr: z.number(),
                  wins: z.number(),
                  losses: z.number(),
                  streak: z.number(),
                  peak_mmr: z.number(),
                  peak_streak: z.number(),
                }),
              ),
            }),
          },
        },
        description: 'Leaderboard retrieved successfully.',
      },
      500: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { queue_id } = c.req.valid('param')
    const { limit } = c.req.valid('query')
    const finalLimit = limit || 100

    try {
      const leaderboard = await COMMAND_HANDLERS.STATS.GET_LEADERBOARD(
        queue_id,
        finalLimit,
      )

      return c.json(
        {
          leaderboard,
        },
        200,
      )
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
      return c.json(
        {
          error: 'Internal server error',
        },
        500,
      )
    }
  },
)

statsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/overall-history/{queue_id}',
    description: 'Get overall match history for a queue.',
    request: {
      params: z.object({
        queue_id: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .openapi({
            param: {
              name: 'queue_id',
              in: 'path',
            },
            example: '1',
          }),
      }),
      query: z.object({
        limit: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .optional()
          .openapi({
            param: {
              name: 'limit',
              in: 'query',
            },
            example: '50',
          }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              matches: z.array(
                z.object({
                  match_id: z.number(),
                  winning_team: z.number().nullable(),
                  deck: z.string().nullable(),
                  stake: z.string().nullable(),
                  best_of_3: z.boolean(),
                  best_of_5: z.boolean(),
                  created_at: z.string(),
                  players: z.array(
                    z.object({
                      user_id: z.string(),
                      team: z.number().nullable(),
                      elo_change: z.number().nullable(),
                    }),
                  ),
                }),
              ),
            }),
          },
        },
        description: 'Overall match history retrieved successfully.',
      },
      500: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { queue_id } = c.req.valid('param')
    const { limit } = c.req.valid('query')
    const finalLimit = limit || 50

    try {
      const matches = await COMMAND_HANDLERS.STATS.GET_OVERALL_HISTORY(
        queue_id,
        finalLimit,
      )

      return c.json(
        {
          matches,
        },
        200,
      )
    } catch (error) {
      console.error('Error fetching overall match history:', error)
      return c.json(
        {
          error: 'Internal server error',
        },
        500,
      )
    }
  },
)

statsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/history/{user_id}/{queue_id}',
    description: 'Get match history for a player in a specific queue.',
    request: {
      params: z.object({
        user_id: z.string().openapi({
          param: {
            name: 'user_id',
            in: 'path',
          },
          example: '123456789012345678',
        }),
        queue_id: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .openapi({
            param: {
              name: 'queue_id',
              in: 'path',
            },
            example: '1',
          }),
      }),
      query: z.object({
        limit: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .optional()
          .openapi({
            param: {
              name: 'limit',
              in: 'query',
            },
            example: '10',
          }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              matches: z.array(
                z.object({
                  match_id: z.number(),
                  won: z.boolean(),
                  elo_change: z.number().nullable(),
                  team: z.number().nullable(),
                  deck: z.string().nullable(),
                  stake: z.string().nullable(),
                  best_of_3: z.boolean(),
                  best_of_5: z.boolean(),
                  created_at: z.string(),
                  winning_team: z.number().nullable(),
                }),
              ),
            }),
          },
        },
        description: 'Match history retrieved successfully.',
      },
      500: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { user_id, queue_id } = c.req.valid('param')
    const { limit } = c.req.valid('query')
    const finalLimit = limit || 50

    try {
      const matches = await COMMAND_HANDLERS.STATS.GET_MATCH_HISTORY(
        user_id,
        queue_id,
        finalLimit,
      )

      return c.json(
        {
          matches,
        },
        200,
      )
    } catch (error) {
      console.error('Error fetching match history:', error)
      return c.json(
        {
          error: 'Internal server error',
        },
        500,
      )
    }
  },
)

statsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/history/{user_id}/{queue_id}',
    description: 'Get match history for a player in a specific queue.',
    request: {
      params: z.object({
        user_id: z.string().openapi({
          param: {
            name: 'user_id',
            in: 'path',
          },
          example: '123456789012345678',
        }),
        queue_id: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .openapi({
            param: {
              name: 'queue_id',
              in: 'path',
            },
            example: '1',
          }),
      }),
      query: z.object({
        limit: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .optional()
          .openapi({
            param: {
              name: 'limit',
              in: 'query',
            },
            example: '10',
          }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              matches: z.array(
                z.object({
                  match_id: z.number(),
                  won: z.boolean(),
                  elo_change: z.number().nullable(),
                  team: z.number().nullable(),
                  deck: z.string().nullable(),
                  stake: z.string().nullable(),
                  best_of_3: z.boolean(),
                  best_of_5: z.boolean(),
                  created_at: z.string(),
                  winning_team: z.number().nullable(),
                }),
              ),
            }),
          },
        },
        description: 'Match history retrieved successfully.',
      },
      500: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { user_id, queue_id } = c.req.valid('param')
    const { limit } = c.req.valid('query')
    const finalLimit = limit || 50

    try {
      const matches = await COMMAND_HANDLERS.STATS.GET_MATCH_HISTORY(
        user_id,
        queue_id,
        finalLimit,
      )

      return c.json(
        {
          matches,
        },
        200,
      )
    } catch (error) {
      console.error('Error fetching match history:', error)
      return c.json(
        {
          error: 'Internal server error',
        },
        500,
      )
    }
  },
)

statsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{user_id}/{queue_id}',
    description: 'Get player statistics for a specific queue.',
    request: {
      params: z.object({
        user_id: z.string().openapi({
          param: {
            name: 'user_id',
            in: 'path',
          },
          example: '123456789012345678',
        }),
        queue_id: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .openapi({
            param: {
              name: 'queue_id',
              in: 'path',
            },
            example: '1',
          }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              mmr: z.number(),
              wins: z.number(),
              losses: z.number(),
              streak: z.number(),
              totalgames: z.number(),
              decay: z.number(),
              name: z.string().nullable(),
              peak_mmr: z.number(),
              peak_streak: z.number(),
              rank: z.number(),
              winrate: z.number(),
            }),
          },
        },
        description: 'Player statistics retrieved successfully.',
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: 'Player not found in this queue.',
      },
      500: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { user_id, queue_id } = c.req.valid('param')

    try {
      const stats = await COMMAND_HANDLERS.STATS.GET_PLAYER_STATS(
        user_id,
        queue_id,
      )

      if (!stats) {
        return c.json(
          {
            error: 'Player not found in this queue.',
          },
          404,
        )
      }

      return c.json(stats, 200)
    } catch (error) {
      console.error('Error fetching player stats:', error)
      return c.json(
        {
          error: 'Internal server error',
        },
        500,
      )
    }
  },
)

export { statsRouter }

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { getActiveSeason } from '../../../utils/queryDB'

const statsRouter = new OpenAPIHono()

const seasonQueryParam = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .optional()
  .openapi({
    param: {
      name: 'season',
      in: 'query',
    },
    example: '5',
  })

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
        season: seasonQueryParam,
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
    const { limit, season: seasonParam } = c.req.valid('query')

    try {
      const season = seasonParam ?? (await getActiveSeason())
      const leaderboard = await COMMAND_HANDLERS.STATS.GET_LEADERBOARD(
        queue_id,
        limit,
        season,
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
        start_date: z
          .string()
          .datetime()
          .optional()
          .openapi({
            param: {
              name: 'start_date',
              in: 'query',
            },
            example: '2024-01-01T00:00:00Z',
          }),
        end_date: z
          .string()
          .datetime()
          .optional()
          .openapi({
            param: {
              name: 'end_date',
              in: 'query',
            },
            example: '2024-12-31T23:59:59Z',
          }),
        after_match_id: z
          .string()
          .regex(/^\d+$/)
          .optional()
          .openapi({
            param: {
              name: 'after_match_id',
              in: 'query',
            },
            example: '123',
          }),
        before_match_id: z
          .string()
          .regex(/^\d+$/)
          .optional()
          .openapi({
            param: {
              name: 'before_match_id',
              in: 'query',
            },
            example: '456',
          }),
        match_id: z
          .string()
          .regex(/^\d+$/)
          .optional()
          .openapi({
            param: {
              name: 'match_id',
              in: 'query',
            },
            example: '789',
          }),
        season: seasonQueryParam,
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
                  season: z.number(),
                  players: z.array(
                    z.object({
                      user_id: z.string(),
                      name: z.string(),
                      team: z.number().nullable(),
                      elo_change: z.number().nullable(),
                      mmr_after: z.number(),
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
    const {
      limit,
      start_date,
      end_date,
      after_match_id,
      before_match_id,
      match_id,
      season: seasonParam,
    } = c.req.valid('query')

    try {
      const season = seasonParam ?? (await getActiveSeason())
      const matches = await COMMAND_HANDLERS.STATS.GET_OVERALL_HISTORY(
        queue_id,
        limit,
        start_date,
        end_date,
        after_match_id,
        before_match_id,
        match_id,
        season,
      )

      return c.json({ matches }, 200)
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
        start_date: z
          .string()
          .datetime()
          .optional()
          .openapi({
            param: {
              name: 'start_date',
              in: 'query',
            },
            example: '2024-01-01T00:00:00Z',
          }),
        end_date: z
          .string()
          .datetime()
          .optional()
          .openapi({
            param: {
              name: 'end_date',
              in: 'query',
            },
            example: '2024-12-31T23:59:59Z',
          }),
        season: seasonQueryParam,
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
                  player_name: z.string(),
                  mmr_after: z.number(),
                  won: z.boolean(),
                  elo_change: z.number().nullable(),
                  team: z.number().nullable(),
                  opponents: z.array(
                    z.object({
                      user_id: z.string(),
                      name: z.string(),
                      team: z.number().nullable(),
                      elo_change: z.number().nullable(),
                      mmr_after: z.number(),
                    }),
                  ),
                  deck: z.string().nullable(),
                  stake: z.string().nullable(),
                  best_of_3: z.boolean(),
                  best_of_5: z.boolean(),
                  created_at: z.string(),
                  winning_team: z.number().nullable(),
                  queue_id: z.number(),
                  season: z.number(),
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
    const { limit, start_date, end_date, season: seasonParam } =
      c.req.valid('query')

    try {
      const season = seasonParam ?? (await getActiveSeason())
      const matches = await COMMAND_HANDLERS.STATS.GET_MATCH_HISTORY({
        userId: user_id,
        queueId: queue_id,
        limit,
        startDate: start_date,
        endDate: end_date,
        season,
      })

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
      query: z.object({
        season: seasonQueryParam,
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
    const { season: seasonParam } = c.req.valid('query')

    try {
      const season = seasonParam ?? (await getActiveSeason())
      const stats = await COMMAND_HANDLERS.STATS.GET_PLAYER_STATS(
        user_id,
        queue_id,
        season,
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

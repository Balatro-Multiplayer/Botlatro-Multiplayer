import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { numericParam } from '../../../utils/validation-utils'

const playersRouter = new OpenAPIHono()

playersRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{player_id}/matches',
    description: "Get a player's match history.",
    request: {
      params: z.object({
        user_id: z.string().openapi({
          param: {
            name: 'player_id',
            in: 'path',
          },
          example: '123456789012345678',
        }),
      }),
      query: z.object({
        queue_id: numericParam.optional().openapi({
          param: {
            name: 'queue_id',
            in: 'path',
          },
          example: '1',
        }),
        limit: numericParam.openapi({
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
    const { user_id } = c.req.valid('param')
    const { limit, start_date, end_date, queue_id } = c.req.valid('query')

    try {
      const matches = await COMMAND_HANDLERS.STATS.GET_MATCH_HISTORY(
        user_id,
        queue_id,
        limit,
        start_date,
        end_date,
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

// playersRouter.openapi(
//   createRoute({
//     method: 'get',
//     path: '/{user_id}/{queue_id}',
//     description: 'Get player statistics for a specific queue.',
//     request: {
//       params: z.object({
//         user_id: z.string().openapi({
//           param: {
//             name: 'user_id',
//             in: 'path',
//           },
//           example: '123456789012345678',
//         }),
//         queue_id: z
//           .string()
//           .regex(/^\d+$/)
//           .transform(Number)
//           .openapi({
//             param: {
//               name: 'queue_id',
//               in: 'path',
//             },
//             example: '1',
//           }),
//       }),
//     },
//     responses: {
//       200: {
//         content: {
//           'application/json': {
//             schema: z.object({
//               mmr: z.number(),
//               wins: z.number(),
//               losses: z.number(),
//               streak: z.number(),
//               totalgames: z.number(),
//               decay: z.number(),
//               name: z.string().nullable(),
//               peak_mmr: z.number(),
//               peak_streak: z.number(),
//               rank: z.number(),
//               winrate: z.number(),
//             }),
//           },
//         },
//         description: 'Player statistics retrieved successfully.',
//       },
//       404: {
//         content: {
//           'application/json': {
//             schema: z.object({
//               error: z.string(),
//             }),
//           },
//         },
//         description: 'Player not found in this queue.',
//       },
//       500: {
//         content: {
//           'application/json': {
//             schema: z.object({
//               error: z.string(),
//             }),
//           },
//         },
//         description: 'Internal server error.',
//       },
//     },
//   }),
//   async (c) => {
//     const { user_id, queue_id } = c.req.valid('param')
//
//     try {
//       const stats = await COMMAND_HANDLERS.STATS.GET_PLAYER_STATS(
//         user_id,
//         queue_id,
//       )
//
//       if (!stats) {
//         return c.json(
//           {
//             error: 'Player not found in this queue.',
//           },
//           404,
//         )
//       }
//
//       return c.json(stats, 200)
//     } catch (error) {
//       console.error('Error fetching player stats:', error)
//       return c.json(
//         {
//           error: 'Internal server error',
//         },
//         500,
//       )
//     }
//   },
// )

export { playersRouter }

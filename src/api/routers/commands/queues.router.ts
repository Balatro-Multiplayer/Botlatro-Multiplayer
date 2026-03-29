import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { pool } from '../../../db'

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

queuesRouter.openapi(
  createRoute({
    method: 'get',
    path: '/settings',
    description: 'Get all queue settings.',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              queues: z.array(z.object({
                id: z.number(),
                queue_name: z.string(),
                queue_desc: z.string(),
                queue_icon: z.string().nullable(),
                color: z.string(),
                default_elo: z.number(),
                members_per_team: z.number(),
                number_of_teams: z.number(),
                elo_search_start: z.number(),
                elo_search_increment: z.number(),
                elo_search_speed: z.number(),
                max_party_elo_difference: z.number().nullable(),
                best_of_allowed: z.boolean(),
                first_deck_ban_num: z.number(),
                second_deck_ban_num: z.number(),
                use_tuple_bans: z.boolean(),
                role_lock_id: z.string().nullable(),
                veto_mmr_threshold: z.number().nullable(),
                instaqueue_min: z.number(),
                instaqueue_max: z.number(),
                locked: z.boolean(),
              })),
            }),
          },
        },
        description: 'All queue settings.',
      },
    },
  }),
  async (c) => {
    const result = await pool.query('SELECT * FROM queues ORDER BY id')
    return c.json({ queues: result.rows }, 200)
  },
)

queuesRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/settings/{id}',
    description: 'Update queue settings.',
    request: {
      params: z.object({
        id: z.coerce.number().openapi({
          param: { name: 'id', in: 'path' },
          example: 1,
        }),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              queue_desc: z.string().optional(),
              queue_icon: z.string().nullable().optional(),
              color: z.string().optional(),
              default_elo: z.number().optional(),
              members_per_team: z.number().optional(),
              number_of_teams: z.number().optional(),
              elo_search_start: z.number().optional(),
              elo_search_increment: z.number().optional(),
              elo_search_speed: z.number().optional(),
              max_party_elo_difference: z.number().nullable().optional(),
              best_of_allowed: z.boolean().optional(),
              first_deck_ban_num: z.number().optional(),
              second_deck_ban_num: z.number().optional(),
              use_tuple_bans: z.boolean().optional(),
              role_lock_id: z.string().nullable().optional(),
              veto_mmr_threshold: z.number().nullable().optional(),
              instaqueue_min: z.number().optional(),
              instaqueue_max: z.number().optional(),
              locked: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              queue: z.object({
                id: z.number(),
                queue_name: z.string(),
                queue_desc: z.string(),
                queue_icon: z.string().nullable(),
                color: z.string(),
                default_elo: z.number(),
                members_per_team: z.number(),
                number_of_teams: z.number(),
                elo_search_start: z.number(),
                elo_search_increment: z.number(),
                elo_search_speed: z.number(),
                max_party_elo_difference: z.number().nullable(),
                best_of_allowed: z.boolean(),
                first_deck_ban_num: z.number(),
                second_deck_ban_num: z.number(),
                use_tuple_bans: z.boolean(),
                role_lock_id: z.string().nullable(),
                veto_mmr_threshold: z.number().nullable(),
                instaqueue_min: z.number(),
                instaqueue_max: z.number(),
                locked: z.boolean(),
              }),
            }),
          },
        },
        description: 'Updated queue settings.',
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
        description: 'Queue not found.',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')

    // Build dynamic SET clause from provided fields
    const entries = Object.entries(body).filter(([_, v]) => v !== undefined)
    if (entries.length === 0) {
      const current = await pool.query('SELECT * FROM queues WHERE id = $1', [id])
      if (current.rowCount === 0) return c.json({ error: 'Queue not found' }, 404)
      return c.json({ success: true, queue: current.rows[0] }, 200)
    }

    const setClauses = entries.map(([key], i) => `${key} = $${i + 2}`)
    const values = entries.map(([_, v]) => v)

    const result = await pool.query(
      `UPDATE queues SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values],
    )

    if (result.rowCount === 0) {
      return c.json({ error: 'Queue not found' }, 404)
    }

    return c.json({ success: true, queue: result.rows[0] }, 200)
  },
)

export { queuesRouter }

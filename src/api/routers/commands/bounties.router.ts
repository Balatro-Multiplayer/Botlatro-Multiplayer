import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  getBountyByName,
  getBountyCompletions,
  getUserBounties,
} from '../../../utils/queryDB'

const bountiesRouter = new OpenAPIHono()

bountiesRouter.openapi(
  createRoute({
    method: 'get',
    path: '/user/{user_id}',
    description: 'Get all bounties completed by a user.',
    request: {
      params: z.object({
        user_id: z.string().openapi({
          param: {
            name: 'user_id',
            in: 'path',
          },
          example: '123456789012345678',
        }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              bounties: z.array(
                z.object({
                  id: z.number(),
                  bounty_id: z.number(),
                  user_id: z.string(),
                  is_first: z.boolean(),
                  completed_at: z.string(),
                  bounty_name: z.string(),
                  description: z.string(),
                }),
              ),
            }),
          },
        },
        description: 'User bounties retrieved successfully.',
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
    const { user_id } = c.req.valid('param')
    try {
      const bounties = await getUserBounties(user_id)
      return c.json({ bounties }, 200)
    } catch (error) {
      console.error('Error fetching user bounties:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

bountiesRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{bounty_name}/completions',
    description: 'Get all users who have completed a specified bounty.',
    request: {
      params: z.object({
        bounty_name: z.string().openapi({
          param: {
            name: 'bounty_name',
            in: 'path',
          },
          example: 'First Blood',
        }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              bounty: z.object({
                id: z.number(),
                bounty_name: z.string(),
                description: z.string(),
              }),
              completions: z.array(
                z.object({
                  id: z.number(),
                  bounty_id: z.number(),
                  user_id: z.string(),
                  is_first: z.boolean(),
                  completed_at: z.string(),
                }),
              ),
            }),
          },
        },
        description: 'Bounty completions retrieved successfully.',
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
        description: 'Bounty not found.',
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
    const { bounty_name } = c.req.valid('param')
    try {
      const bounty = await getBountyByName(bounty_name)
      if (!bounty) {
        return c.json({ error: `Bounty "${bounty_name}" not found.` }, 404)
      }
      const completions = await getBountyCompletions(bounty.id)
      return c.json({ bounty, completions }, 200)
    } catch (error) {
      console.error('Error fetching bounty completions:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

export { bountiesRouter }

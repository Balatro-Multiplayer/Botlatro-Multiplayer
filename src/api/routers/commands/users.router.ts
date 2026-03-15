import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { pool } from '../../../db'

const usersRouter = new OpenAPIHono()

const discordIdSchema = z
  .string()
  .regex(/^\d{17,20}$/)
  .openapi({ example: '123456789012345678' })

const userSchema = z.object({
  user_id: z.string(),
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
})

const getUserRoute = createRoute({
  method: 'get',
  path: '/{user_id}',
  request: {
    params: z.object({ user_id: discordIdSchema }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: userSchema } },
      description: 'User info',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'User not found',
    },
  },
})

usersRouter.openapi(getUserRoute, async (c) => {
  const { user_id } = c.req.valid('param')

  const res = await pool.query<{
    user_id: string
    username: string
    display_name: string
    avatar_url: string | null
  }>(
    `SELECT user_id, username, display_name, avatar_url
     FROM guild_members
     WHERE user_id = $1`,
    [user_id],
  )

  const row = res.rows[0]
  if (!row) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json(row, 200)
})

export { usersRouter }

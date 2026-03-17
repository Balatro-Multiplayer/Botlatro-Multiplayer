import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { pool } from '../../../db'

const usersRouter = new OpenAPIHono()

const discordIdSchema = z
  .string()
  .regex(/^\d{17,20}$/)
  .openapi({ example: '123456789012345678' })

const activeBanSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  reason: z.string(),
  expires_at: z.string().nullable(),
  related_strike_ids: z.array(z.number()).nullable(),
  allowed_queue_ids: z.array(z.number()).nullable(),
})

const userSchema = z.object({
  user_id: z.string(),
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
  active_ban: activeBanSchema.nullable(),
})

type ActiveBanRow = {
  id: number
  user_id: string
  reason: string
  expires_at: Date | null
  related_strike_ids: number[] | null
  allowed_queue_ids: number[] | null
}

function serializeDate(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

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
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
      description: 'User not found',
    },
  },
})

usersRouter.openapi(getUserRoute, async (c) => {
  const { user_id } = c.req.valid('param')

  const [res, activeBanRes] = await Promise.all([
    pool.query<{
      user_id: string
      username: string
      display_name: string
      avatar_url: string | null
    }>(
      `SELECT user_id, username, display_name, avatar_url
       FROM guild_members
       WHERE user_id = $1`,
      [user_id],
    ),
    pool.query<ActiveBanRow>(
      `SELECT id, user_id, reason, expires_at, related_strike_ids, allowed_queue_ids
       FROM bans
       WHERE user_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY expires_at ASC NULLS LAST
       LIMIT 1`,
      [user_id],
    ),
  ])

  const row = res.rows[0]
  if (!row) {
    return c.json({ error: 'User not found' }, 404)
  }

  const activeBan = activeBanRes.rows[0]

  return c.json(
    {
      ...row,
      active_ban: activeBan
        ? {
            id: activeBan.id,
            user_id: activeBan.user_id,
            reason: activeBan.reason,
            expires_at: serializeDate(activeBan.expires_at),
            related_strike_ids: activeBan.related_strike_ids ?? null,
            allowed_queue_ids: activeBan.allowed_queue_ids ?? null,
          }
        : null,
    },
    200,
  )
})

export { usersRouter }

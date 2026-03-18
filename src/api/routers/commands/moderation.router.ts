import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { GuildMember, User } from 'discord.js'
import type { Bans, Strikes } from 'psqlDB'
import { COMMAND_HANDLERS } from '../../../command-handlers'
import { CreateBanError } from '../../../command-handlers/moderation/createBan'
import { UpdateBanError } from '../../../command-handlers/moderation/updateBan'
import { client, getGuild } from '../../../client'
import { moderationMessages } from '../../../config/moderationMessages'
import { pool } from '../../../db'
import { calculateExpiryDate } from '../../../utils/calculateExpiryDate'
import { createEmbedType, logStrike } from '../../../utils/logCommandUse'
import { sendDm } from '../../../utils/sendDm'

const moderationRouter = new OpenAPIHono()

const positiveIntQuery = z.coerce.number().int().min(1)
const moderationSortQuery = z.enum(['recent', 'alphabetical'])
const booleanQuery = z.preprocess((value) => {
  if (value === undefined) return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return value
}, z.boolean())

const discordIdSchema = z
  .string()
  .regex(/^\d{17,20}$/)
  .openapi({
    example: '123456789012345678',
  })

const moderationUserSchema = z.object({
  discord_id: z.string(),
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
})

const moderationBanSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  reason: z.string(),
  expires_at: z.string().nullable(),
  related_strike_ids: z.array(z.number()).nullable(),
  allowed_queue_ids: z.array(z.number()).nullable(),
})

const moderationStrikeSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  reason: z.string(),
  issued_by_id: z.string(),
  issued_at: z.string(),
  expires_at: z.string().nullable(),
  amount: z.number(),
  reference: z.string(),
  issued_by: moderationUserSchema.nullable(),
})

const moderationPlayerSchema = moderationUserSchema.extend({
  strikes: z.array(moderationStrikeSchema),
  active_ban: moderationBanSchema.nullable(),
  total_strike_points: z.number(),
  latest_strike_at: z.string().nullable(),
})

const paginatedPlayersSchema = z.object({
  data: z.array(moderationPlayerSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

const errorSchema = z.object({
  error: z.string(),
})

const strikeListQuerySchema = z.object({
  page: positiveIntQuery
    .optional()
    .default(1)
    .openapi({
      param: { name: 'page', in: 'query' },
      example: '1',
    }),
  limit: positiveIntQuery
    .max(100)
    .optional()
    .default(20)
    .openapi({
      param: { name: 'limit', in: 'query' },
      example: '20',
    }),
  search: z
    .string()
    .trim()
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      example: 'player',
    }),
  sort: moderationSortQuery
    .optional()
    .default('recent')
    .openapi({
      param: { name: 'sort', in: 'query' },
      example: 'recent',
    }),
  include_bans: booleanQuery
    .optional()
    .default(false)
    .openapi({
      param: { name: 'include_bans', in: 'query' },
      example: 'true',
    }),
})

const bansListQuerySchema = z.object({
  page: positiveIntQuery
    .optional()
    .default(1)
    .openapi({
      param: { name: 'page', in: 'query' },
      example: '1',
    }),
  limit: positiveIntQuery
    .max(100)
    .optional()
    .default(20)
    .openapi({
      param: { name: 'limit', in: 'query' },
      example: '20',
    }),
  search: z
    .string()
    .trim()
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      example: 'player',
    }),
})

const userIdParamSchema = z.object({
  user_id: discordIdSchema.openapi({
    param: { name: 'user_id', in: 'path' },
  }),
})

const strikeIdParamSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive()
    .openapi({
      param: { name: 'id', in: 'path' },
      example: '42',
    }),
})

const giveStrikeBodySchema = z.object({
  user_id: discordIdSchema,
  amount: z.number().int().min(0).max(6),
  reason: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(500).optional(),
  issued_by_id: discordIdSchema,
})

const removeStrikeBodySchema = z.object({
  removed_by_id: discordIdSchema,
  reason: z.string().trim().max(500).optional(),
})

const createBanBodySchema = z.object({
  user_id: discordIdSchema,
  length: z.number().min(0),
  reason: z.string().trim().min(1).max(500),
  banned_by_id: discordIdSchema,
})

const updateBanBodySchema = z
  .object({
    updated_by_id: discordIdSchema,
    length: z.number().min(0).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((body) => body.length !== undefined || body.reason !== undefined, {
    message: 'Provide at least one field to update.',
  })

const removeBanBodySchema = z.object({
  unbanned_by_id: discordIdSchema,
  reason: z.string().trim().max(500).optional(),
})

const guildSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .openapi({
      param: { name: 'q', in: 'query' },
      example: 'play',
    }),
})

type ModerationUser = z.infer<typeof moderationUserSchema>
type ModerationStrike = z.infer<typeof moderationStrikeSchema>
type ModerationBan = z.infer<typeof moderationBanSchema>
type ModerationPlayer = z.infer<typeof moderationPlayerSchema>
type ModerationSort = z.infer<typeof moderationSortQuery>

type StrikeRow = Strikes & {
  issued_at: Date
  expires_at: Date | null
}

type BanRow = Bans & {
  expires_at: Date | null
}

function serializeDate(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

async function resolveDiscordUser(userId: string): Promise<ModerationUser> {
  let user: User | null = null

  try {
    user = await client.users.fetch(userId)
  } catch {
    user = null
  }

  return {
    discord_id: userId,
    username: user?.username ?? userId,
    display_name: user?.globalName ?? user?.username ?? userId,
    avatar_url: user
      ? user.displayAvatarURL({
          extension: 'png',
          size: 128,
        })
      : null,
  }
}

async function resolveDiscordUsers(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0) return new Map<string, ModerationUser>()

  // Resolve from guild_members table first
  const dbResult = await pool.query<{
    user_id: string
    username: string
    display_name: string
    avatar_url: string | null
  }>(
    `SELECT user_id, username, display_name, avatar_url
     FROM guild_members
     WHERE user_id = ANY($1::text[])`,
    [uniqueUserIds],
  )

  const resolved = new Map<string, ModerationUser>()
  for (const row of dbResult.rows) {
    resolved.set(row.user_id, {
      discord_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
    })
  }

  // Fallback to Discord API for any missing users
  const missing = uniqueUserIds.filter((id) => !resolved.has(id))
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (userId) => {
        const profile = await resolveDiscordUser(userId)
        resolved.set(userId, profile)
      }),
    )
  }

  return resolved
}

function serializeBan(ban: BanRow | null): ModerationBan | null {
  if (!ban) return null

  return {
    id: ban.id,
    user_id: ban.user_id,
    reason: ban.reason,
    expires_at: serializeDate(ban.expires_at),
    related_strike_ids: ban.related_strike_ids ?? null,
    allowed_queue_ids: ban.allowed_queue_ids ?? null,
  }
}

function serializeStrike(
  strike: StrikeRow,
  issuers: Map<string, ModerationUser>,
): ModerationStrike {
  return {
    id: strike.id,
    user_id: strike.user_id,
    reason: strike.reason,
    issued_by_id: strike.issued_by_id,
    issued_at: serializeDate(strike.issued_at) ?? new Date(0).toISOString(),
    expires_at: serializeDate(strike.expires_at),
    amount: strike.amount,
    reference: strike.reference,
    issued_by: issuers.get(strike.issued_by_id) ?? null,
  }
}

function paginate<T>(items: T[], page: number, limit: number) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const offset = (page - 1) * limit

  return {
    data: items.slice(offset, offset + limit),
    page,
    limit,
    total,
    totalPages,
  }
}

async function fetchActiveBans(): Promise<BanRow[]> {
  const res = await pool.query<BanRow>(
    `
      SELECT *
      FROM bans
      WHERE expires_at IS NULL OR expires_at > NOW()
    `,
  )

  return res.rows
}

async function fetchActiveBanByUserId(userId: string): Promise<BanRow | null> {
  const res = await pool.query<BanRow>(
    `
      SELECT *
      FROM bans
      WHERE user_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY expires_at ASC NULLS LAST
      LIMIT 1
    `,
    [userId],
  )

  return res.rows[0] ?? null
}

async function fetchStrikesForUsers(userIds: string[]): Promise<StrikeRow[]> {
  if (userIds.length === 0) return []

  const res = await pool.query<StrikeRow>(
    `
      SELECT *
      FROM strikes
      WHERE user_id = ANY($1::text[])
      ORDER BY issued_at DESC, id DESC
    `,
    [userIds],
  )

  return res.rows
}

async function buildPlayersPage({
  userIds,
  page,
  limit,
  total,
  activeBanMap,
  strikeLatestMap,
}: {
  userIds: string[]
  page: number
  limit: number
  total: number
  activeBanMap: Map<string, BanRow>
  strikeLatestMap: Map<string, Date | null>
}) {
  const strikes = await fetchStrikesForUsers(userIds)
  const strikesByUser = new Map<string, StrikeRow[]>()

  for (const strike of strikes) {
    const existing = strikesByUser.get(strike.user_id)
    if (existing) {
      existing.push(strike)
    } else {
      strikesByUser.set(strike.user_id, [strike])
    }
  }

  const issuerIds = [...new Set(strikes.map((strike) => strike.issued_by_id))]
  const users = await resolveDiscordUsers([...userIds, ...issuerIds])

  const data: ModerationPlayer[] = userIds.map((userId) => {
    const user = users.get(userId) ?? {
      discord_id: userId,
      username: userId,
      display_name: userId,
      avatar_url: null,
    }
    const userStrikes = (strikesByUser.get(userId) ?? []).map((strike) =>
      serializeStrike(strike, users),
    )
    const activeBan = serializeBan(activeBanMap.get(userId) ?? null)
    const latestStrikeAt =
      serializeDate(strikeLatestMap.get(userId) ?? null) ??
      userStrikes[0]?.issued_at ??
      null

    return {
      ...user,
      strikes: userStrikes,
      active_ban: activeBan,
      total_strike_points: userStrikes.reduce(
        (runningTotal, strike) => runningTotal + strike.amount,
        0,
      ),
      latest_strike_at: latestStrikeAt,
    }
  })

  return {
    data,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

async function listModerationPlayersFast({
  page,
  limit,
  includeBans,
  bansOnly,
}: {
  page: number
  limit: number
  includeBans: boolean
  bansOnly: boolean
}) {
  const offset = (page - 1) * limit
  const activeBans = await fetchActiveBans()
  const activeBanMap = new Map(activeBans.map((ban) => [ban.user_id, ban]))

  if (bansOnly) {
    const orderedBans = [...activeBans].sort((left, right) => {
      const leftExpiry = left.expires_at
        ? left.expires_at.getTime()
        : Number.MAX_SAFE_INTEGER
      const rightExpiry = right.expires_at
        ? right.expires_at.getTime()
        : Number.MAX_SAFE_INTEGER

      return leftExpiry - rightExpiry
    })
    const pageUserIds = orderedBans
      .slice(offset, offset + limit)
      .map((ban) => ban.user_id)

    return buildPlayersPage({
      userIds: pageUserIds,
      page,
      limit,
      total: orderedBans.length,
      activeBanMap,
      strikeLatestMap: new Map(),
    })
  }

  if (includeBans) {
    const combinedRows = await pool.query<{
      user_id: string
      latest_strike_at: Date | null
    }>(
      `
        WITH strike_users AS (
          SELECT user_id, MAX(issued_at) AS latest_strike_at
          FROM strikes
          GROUP BY user_id
        ),
        ban_only_users AS (
          SELECT b.user_id, NULL::timestamp AS latest_strike_at
          FROM bans b
          WHERE (b.expires_at IS NULL OR b.expires_at > NOW())
            AND NOT EXISTS (
              SELECT 1
              FROM strike_users s
              WHERE s.user_id = b.user_id
            )
        ),
        combined_users AS (
          SELECT * FROM strike_users
          UNION ALL
          SELECT * FROM ban_only_users
        )
        SELECT user_id, latest_strike_at
        FROM combined_users
        ORDER BY latest_strike_at DESC NULLS LAST, user_id ASC
        LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    )
    const totalRes = await pool.query<{ total: string }>(
      `
        WITH strike_users AS (
          SELECT user_id
          FROM strikes
          GROUP BY user_id
        ),
        ban_only_users AS (
          SELECT b.user_id
          FROM bans b
          WHERE (b.expires_at IS NULL OR b.expires_at > NOW())
            AND NOT EXISTS (
              SELECT 1
              FROM strike_users s
              WHERE s.user_id = b.user_id
            )
        )
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT user_id FROM strike_users
          UNION ALL
          SELECT user_id FROM ban_only_users
        ) combined_users
      `,
    )
    const strikeLatestMap = new Map(
      combinedRows.rows.map((row) => [row.user_id, row.latest_strike_at]),
    )

    return buildPlayersPage({
      userIds: combinedRows.rows.map((row) => row.user_id),
      page,
      limit,
      total: Number(totalRes.rows[0]?.total ?? 0),
      activeBanMap,
      strikeLatestMap,
    })
  }

  const strikeRows = await pool.query<{
    user_id: string
    latest_strike_at: Date | null
  }>(
    `
      SELECT user_id, MAX(issued_at) AS latest_strike_at
      FROM strikes
      GROUP BY user_id
      ORDER BY MAX(issued_at) DESC, user_id ASC
      LIMIT $1 OFFSET $2
    `,
    [limit, offset],
  )
  const totalRes = await pool.query<{ total: string }>(
    `
      SELECT COUNT(DISTINCT user_id)::int AS total
      FROM strikes
    `,
  )
  const strikeLatestMap = new Map(
    strikeRows.rows.map((row) => [row.user_id, row.latest_strike_at]),
  )

  return buildPlayersPage({
    userIds: strikeRows.rows.map((row) => row.user_id),
    page,
    limit,
    total: Number(totalRes.rows[0]?.total ?? 0),
    activeBanMap,
    strikeLatestMap,
  })
}

async function searchModerationUserIds(search: string): Promise<Set<string>> {
  const pattern = `%${search}%`
  const res = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM guild_members
     WHERE user_id = $1
        OR username ILIKE $2
        OR display_name ILIKE $2`,
    [search, pattern],
  )
  return new Set(res.rows.map((r) => r.user_id))
}

async function listModerationPlayers({
  page,
  limit,
  search,
  sort,
  includeBans,
  bansOnly,
}: {
  page: number
  limit: number
  search?: string
  sort: ModerationSort
  includeBans: boolean
  bansOnly: boolean
}) {
  const trimmedSearch = search?.trim().toLowerCase()

  if (!trimmedSearch && sort === 'recent') {
    return listModerationPlayersFast({
      page,
      limit,
      includeBans,
      bansOnly,
    })
  }

  // Search guild_members table to get matching user IDs
  const searchUserIds = trimmedSearch
    ? await searchModerationUserIds(trimmedSearch)
    : null

  const [activeBans, strikeUserRows] = await Promise.all([
    fetchActiveBans(),
    searchUserIds && searchUserIds.size > 0
      ? pool.query<{ user_id: string; latest_strike_at: Date | null }>(
          `SELECT user_id, MAX(issued_at) AS latest_strike_at
           FROM strikes
           WHERE user_id = ANY($1::text[])
           GROUP BY user_id`,
          [[...searchUserIds]],
        )
      : searchUserIds
        ? { rows: [] as { user_id: string; latest_strike_at: Date | null }[] }
        : pool.query<{ user_id: string; latest_strike_at: Date | null }>(
            `SELECT user_id, MAX(issued_at) AS latest_strike_at
             FROM strikes
             GROUP BY user_id`,
          ),
  ])

  const strikeLatestMap = new Map(
    strikeUserRows.rows.map((row) => [row.user_id, row.latest_strike_at]),
  )
  const activeBanMap = new Map(activeBans.map((ban) => [ban.user_id, ban]))

  const userIds = new Set<string>()

  if (bansOnly) {
    for (const ban of activeBans) {
      if (!searchUserIds || searchUserIds.has(ban.user_id)) {
        userIds.add(ban.user_id)
      }
    }
  } else {
    for (const row of strikeUserRows.rows) {
      userIds.add(row.user_id)
    }

    if (includeBans) {
      for (const ban of activeBans) {
        if (!searchUserIds || searchUserIds.has(ban.user_id)) {
          userIds.add(ban.user_id)
        }
      }
    }
  }

  if (searchUserIds && userIds.size === 0) {
    return { data: [], page, limit, total: 0, totalPages: 1 }
  }

  const moderationUserIds = [...userIds]
  const strikes = await fetchStrikesForUsers(moderationUserIds)
  const strikesByUser = new Map<string, StrikeRow[]>()

  for (const strike of strikes) {
    const existing = strikesByUser.get(strike.user_id)
    if (existing) {
      existing.push(strike)
    } else {
      strikesByUser.set(strike.user_id, [strike])
    }
  }

  const issuerIds = [...new Set(strikes.map((strike) => strike.issued_by_id))]
  const users = await resolveDiscordUsers([...moderationUserIds, ...issuerIds])

  const players: ModerationPlayer[] = moderationUserIds.map((userId) => {
    const user = users.get(userId) ?? {
      discord_id: userId,
      username: userId,
      display_name: userId,
      avatar_url: null,
    }
    const userStrikes = (strikesByUser.get(userId) ?? []).map((strike) =>
      serializeStrike(strike, users),
    )
    const activeBan = serializeBan(activeBanMap.get(userId) ?? null)
    const latestStrikeAt =
      serializeDate(strikeLatestMap.get(userId) ?? null) ??
      userStrikes[0]?.issued_at ??
      null

    return {
      ...user,
      strikes: userStrikes,
      active_ban: activeBan,
      total_strike_points: userStrikes.reduce(
        (total, strike) => total + strike.amount,
        0,
      ),
      latest_strike_at: latestStrikeAt,
    }
  })

  players.sort((left, right) => {
    if (bansOnly) {
      const leftExpiry = left.active_ban?.expires_at
        ? Date.parse(left.active_ban.expires_at)
        : Number.MAX_SAFE_INTEGER
      const rightExpiry = right.active_ban?.expires_at
        ? Date.parse(right.active_ban.expires_at)
        : Number.MAX_SAFE_INTEGER

      return leftExpiry - rightExpiry
    }

    if (sort === 'alphabetical') {
      return left.display_name.localeCompare(right.display_name)
    }

    const leftTime = left.latest_strike_at
      ? Date.parse(left.latest_strike_at)
      : 0
    const rightTime = right.latest_strike_at
      ? Date.parse(right.latest_strike_at)
      : 0

    return rightTime - leftTime
  })

  return paginate(players, page, limit)
}

async function serializeGuildMember(
  member: GuildMember,
): Promise<ModerationUser> {
  const user = member.user

  return {
    discord_id: user.id,
    username: user.username,
    display_name: member.displayName ?? user.globalName ?? user.username,
    avatar_url: user.displayAvatarURL({
      extension: 'png',
      size: 128,
    }),
  }
}

moderationRouter.openapi(
  createRoute({
    method: 'get',
    path: '/strikes',
    description: 'List players with strike history.',
    request: {
      query: strikeListQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: paginatedPlayersSchema,
          },
        },
        description: 'Players with moderation history.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query')

    try {
      const response = await listModerationPlayers({
        page: query.page,
        limit: query.limit,
        search: query.search,
        sort: query.sort,
        includeBans: query.include_bans,
        bansOnly: false,
      })

      return c.json(response, 200)
    } catch (error) {
      console.error('Error listing moderation strikes:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

moderationRouter.openapi(
  createRoute({
    method: 'get',
    path: '/strikes/{user_id}',
    description: 'Get strikes for a specific user.',
    request: {
      params: userIdParamSchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              player: moderationPlayerSchema,
            }),
          },
        },
        description: 'User moderation details.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { user_id } = c.req.valid('param')

    try {
      const strikes = await fetchStrikesForUsers([user_id])
      const activeBan =
        (await fetchActiveBans()).find((ban) => ban.user_id === user_id) ?? null
      const issuers = await resolveDiscordUsers([
        user_id,
        ...new Set(strikes.map((strike) => strike.issued_by_id)),
      ])

      const playerUser =
        issuers.get(user_id) ?? (await resolveDiscordUser(user_id))
      const serializedStrikes = strikes.map((strike) =>
        serializeStrike(strike, issuers),
      )

      return c.json(
        {
          player: {
            ...playerUser,
            strikes: serializedStrikes,
            active_ban: serializeBan(activeBan),
            total_strike_points: serializedStrikes.reduce(
              (total, strike) => total + strike.amount,
              0,
            ),
            latest_strike_at: serializedStrikes[0]?.issued_at ?? null,
          },
        },
        200,
      )
    } catch (error) {
      console.error(`Error fetching strikes for user ${user_id}:`, error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

moderationRouter.openapi(
  createRoute({
    method: 'post',
    path: '/strikes',
    description: 'Create a strike for a user.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: giveStrikeBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              strike: moderationStrikeSchema,
            }),
          },
        },
        description: 'Created strike.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const body = c.req.valid('json')

    try {
      const hasPriorStrikes =
        ((
          await pool.query(
            `SELECT id FROM strikes WHERE user_id = $1 LIMIT 1`,
            [body.user_id],
          )
        ).rowCount ?? 0) > 0
      const finalAmount = hasPriorStrikes && body.amount === 0 ? 1 : body.amount
      const reason = body.reason.trim()
      const reference = body.reference?.trim() || 'No reference provided'
      const expiryDate =
        (await calculateExpiryDate(body.user_id)) ??
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      const inserted = await pool.query<StrikeRow>(
        `
          INSERT INTO strikes (user_id, reason, issued_by_id, issued_at, expires_at, amount, reference)
          VALUES ($1, $2, $3, NOW(), $4, $5, $6)
          RETURNING *
        `,
        [
          body.user_id,
          reason,
          body.issued_by_id,
          expiryDate,
          finalAmount,
          reference,
        ],
      )

      const strike = inserted.rows[0]
      const allStrikes = await fetchStrikesForUsers([body.user_id])
      const totalStrikes = allStrikes.reduce(
        (total, entry) => total + entry.amount,
        0,
      )
      const blame = (await resolveDiscordUser(body.issued_by_id)).username

      const embed = createEmbedType(
        `#${strike.id} - STRIKE GIVEN`,
        `<@${body.user_id}>`,
        null,
        [
          {
            name: 'Amount',
            value: `${finalAmount} (total: ${totalStrikes})`,
            inline: true,
          },
          { name: 'Reason', value: reason, inline: true },
          { name: 'Ref', value: reference, inline: true },
        ],
        null,
        blame,
      )
      await logStrike('add_strike', embed, undefined, `<@${body.user_id}>`)

      const issuers = await resolveDiscordUsers([
        body.user_id,
        body.issued_by_id,
      ])

      return c.json(
        {
          strike: serializeStrike(strike, issuers),
        },
        200,
      )
    } catch (error) {
      console.error('Error creating strike:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

moderationRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/strikes/{id}',
    description: 'Remove a strike by id.',
    request: {
      params: strikeIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: removeStrikeBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
            }),
          },
        },
        description: 'Strike removed.',
      },
      404: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Strike not found.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')

    try {
      const existing = await pool.query<StrikeRow>(
        `SELECT * FROM strikes WHERE id = $1 LIMIT 1`,
        [id],
      )
      const strike = existing.rows[0]

      if (!strike) {
        return c.json({ error: 'Strike not found' }, 404)
      }

      await pool.query(`DELETE FROM strikes WHERE id = $1`, [id])

      const blame = (await resolveDiscordUser(body.removed_by_id)).username
      const fields = [
        { name: 'Amount', value: `${strike.amount}`, inline: true },
        { name: 'Reason', value: strike.reason, inline: true },
        { name: 'Ref', value: strike.reference, inline: true },
      ]

      if (body.reason?.trim()) {
        fields.push({
          name: 'Removal Reason',
          value: body.reason.trim(),
          inline: false,
        })
      }

      const embed = createEmbedType(
        `#${strike.id} - STRIKE REMOVED`,
        `<@${strike.user_id}>`,
        null,
        fields,
        null,
        blame,
      )
      await logStrike('remove_strike', embed, undefined, `<@${strike.user_id}>`)

      return c.json({ success: true as const }, 200)
    } catch (error) {
      console.error(`Error removing strike ${id}:`, error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

moderationRouter.openapi(
  createRoute({
    method: 'get',
    path: '/bans',
    description: 'List active bans.',
    request: {
      query: bansListQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: paginatedPlayersSchema,
          },
        },
        description: 'Active bans.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query')

    try {
      const response = await listModerationPlayers({
        page: query.page,
        limit: query.limit,
        search: query.search,
        sort: 'recent',
        includeBans: true,
        bansOnly: true,
      })

      return c.json(response, 200)
    } catch (error) {
      console.error('Error listing active bans:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

moderationRouter.openapi(
  createRoute({
    method: 'post',
    path: '/bans',
    description: 'Create a ban for a user.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: createBanBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              ban: moderationBanSchema,
            }),
          },
        },
        description: 'Created ban.',
      },
      409: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'User already banned.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const body = c.req.valid('json')

    try {
      const blame = (await resolveDiscordUser(body.banned_by_id)).username
      const { ban } = await COMMAND_HANDLERS.MODERATION.CREATE_BAN({
        userId: body.user_id,
        blame,
        length: body.length,
        reason: body.reason,
      })

      return c.json(
        {
          ban: serializeBan(ban)!,
        },
        200,
      )
    } catch (error) {
      if (error instanceof CreateBanError) {
        const expiryText = error.expiresAt
          ? ` until ${serializeDate(error.expiresAt)}`
          : ''
        return c.json({ error: `User already banned${expiryText}.` }, 409)
      }

      console.error('Error creating ban:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

moderationRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/bans/{user_id}',
    description: 'Remove an active ban for a user.',
    request: {
      params: userIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: removeBanBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
            }),
          },
        },
        description: 'Ban removed.',
      },
      404: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Ban not found.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { user_id } = c.req.valid('param')
    const body = c.req.valid('json')

    try {
      const removed = await pool.query<BanRow>(
        `
          DELETE FROM bans
          WHERE user_id = $1
            AND (expires_at IS NULL OR expires_at > NOW())
          RETURNING *
        `,
        [user_id],
      )

      const ban = removed.rows[0]

      if (!ban) {
        return c.json({ error: 'Ban not found' }, 404)
      }

      const blame = (await resolveDiscordUser(body.unbanned_by_id)).username
      const user = await resolveDiscordUser(user_id)
      const fields = [
        { name: 'Reason', value: ban.reason, inline: true },
        {
          name: 'Expires',
          value: serializeDate(ban.expires_at) ?? 'Never',
          inline: true,
        },
      ]

      if (body.reason?.trim()) {
        fields.push({
          name: 'Removal Reason',
          value: body.reason.trim(),
          inline: false,
        })
      }

      const embed = createEmbedType(
        `Ban removed for ${user.display_name}`,
        '',
        '#00ff00',
        fields,
        null,
        blame,
      )
      await logStrike('general', embed)
      await sendDm(
        user_id,
        moderationMessages.banLiftedDm({ reason: body.reason }),
      )

      return c.json({ success: true as const }, 200)
    } catch (error) {
      console.error(`Error removing ban for user ${user_id}:`, error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

moderationRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/bans/{user_id}',
    description: 'Update an active ban for a user.',
    request: {
      params: userIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateBanBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              ban: moderationBanSchema,
            }),
          },
        },
        description: 'Updated ban.',
      },
      404: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Ban not found.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { user_id } = c.req.valid('param')
    const body = c.req.valid('json')

    try {
      const blame = (await resolveDiscordUser(body.updated_by_id)).username
      const { updatedBan } = await COMMAND_HANDLERS.MODERATION.UPDATE_BAN({
        userId: user_id,
        blame,
        length: body.length,
        reason: body.reason,
      })

      return c.json(
        {
          ban: serializeBan(updatedBan)!,
        },
        200,
      )
    } catch (error) {
      if (error instanceof UpdateBanError && error.code === 'NOT_FOUND') {
        return c.json({ error: error.message }, 404)
      }

      console.error(`Error updating ban for user ${user_id}:`, error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

moderationRouter.openapi(
  createRoute({
    method: 'get',
    path: '/users/search',
    description: 'Search guild members.',
    request: {
      query: guildSearchQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(moderationUserSchema),
            }),
          },
        },
        description: 'Guild member search results.',
      },
      400: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Bad request.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const { q } = c.req.valid('query')

    if (!q.trim()) {
      return c.json({ error: 'Query is required' }, 400)
    }

    try {
      const guild = await getGuild()
      const members = await guild.members.fetch({
        query: q.trim(),
        limit: 10,
      })
      const data = await Promise.all(
        [...members.values()].map((member) => serializeGuildMember(member)),
      )

      return c.json({ data }, 200)
    } catch (error) {
      console.error(`Error searching guild members for "${q}":`, error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

const membersFilterQuery = z.enum(['all', 'banned', 'striked'])

const membersListQuerySchema = z.object({
  page: positiveIntQuery
    .optional()
    .default(1)
    .openapi({
      param: { name: 'page', in: 'query' },
      example: '1',
    }),
  limit: positiveIntQuery
    .max(100)
    .optional()
    .default(20)
    .openapi({
      param: { name: 'limit', in: 'query' },
      example: '20',
    }),
  search: z
    .string()
    .trim()
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      example: 'player',
    }),
  filter: membersFilterQuery
    .optional()
    .default('all')
    .openapi({
      param: { name: 'filter', in: 'query' },
      example: 'all',
    }),
})

moderationRouter.openapi(
  createRoute({
    method: 'get',
    path: '/members',
    description:
      'List all guild members with their moderation data (strikes + bans).',
    request: {
      query: membersListQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: paginatedPlayersSchema,
          },
        },
        description: 'Paginated guild members with moderation data.',
      },
      500: {
        content: {
          'application/json': {
            schema: errorSchema,
          },
        },
        description: 'Internal server error.',
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query')
    const { page, limit, search, filter } = query
    const offset = (page - 1) * limit
    const trimmedSearch = search?.trim()

    try {
      type MemberRow = {
        user_id: string
        username: string
        display_name: string
        avatar_url: string | null
      }

      let membersResult: { rows: MemberRow[] }
      let totalResult: { rows: { total: number }[] }

      // Build filter join clause
      let filterJoin = ''
      if (filter === 'banned') {
        filterJoin = `INNER JOIN bans b ON b.user_id = gm.user_id AND (b.expires_at IS NULL OR b.expires_at > NOW())`
      } else if (filter === 'striked') {
        filterJoin = `INNER JOIN (SELECT DISTINCT user_id FROM strikes) s ON s.user_id = gm.user_id`
      }

      if (trimmedSearch) {
        const pattern = `%${trimmedSearch}%`
        const searchWhere = `WHERE (gm.user_id = $1 OR gm.username ILIKE $2 OR gm.display_name ILIKE $2)`
        ;[membersResult, totalResult] = await Promise.all([
          pool.query<MemberRow>(
            `SELECT gm.user_id, gm.username, gm.display_name, gm.avatar_url
             FROM guild_members gm
             ${filterJoin}
             ${searchWhere}
             ORDER BY gm.display_name ASC
             LIMIT $3 OFFSET $4`,
            [trimmedSearch, pattern, limit, offset],
          ),
          pool.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total
             FROM guild_members gm
             ${filterJoin}
             ${searchWhere}`,
            [trimmedSearch, pattern],
          ),
        ])
      } else {
        ;[membersResult, totalResult] = await Promise.all([
          pool.query<MemberRow>(
            `SELECT gm.user_id, gm.username, gm.display_name, gm.avatar_url
             FROM guild_members gm
             ${filterJoin}
             ORDER BY gm.display_name ASC
             LIMIT $1 OFFSET $2`,
            [limit, offset],
          ),
          pool.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total
             FROM guild_members gm
             ${filterJoin}`,
          ),
        ])
      }

      const total = Number(totalResult.rows[0]?.total ?? 0)
      const userIds = membersResult.rows.map((r) => r.user_id)

      if (userIds.length === 0) {
        return c.json(
          {
            data: [],
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
          200,
        )
      }

      // Fetch strikes and bans for these users
      const [strikes, activeBans] = await Promise.all([
        fetchStrikesForUsers(userIds),
        fetchActiveBans(),
      ])

      const activeBanMap = new Map(
        activeBans
          .filter((ban) => userIds.includes(ban.user_id))
          .map((ban) => [ban.user_id, ban]),
      )

      const strikesByUser = new Map<string, StrikeRow[]>()
      for (const strike of strikes) {
        const existing = strikesByUser.get(strike.user_id)
        if (existing) {
          existing.push(strike)
        } else {
          strikesByUser.set(strike.user_id, [strike])
        }
      }

      const issuerIds = [...new Set(strikes.map((s) => s.issued_by_id))]
      const issuers = await resolveDiscordUsers(issuerIds)

      const data: ModerationPlayer[] = membersResult.rows.map((member) => {
        const userStrikes = (strikesByUser.get(member.user_id) ?? []).map(
          (strike) => serializeStrike(strike, issuers),
        )
        const activeBan = serializeBan(activeBanMap.get(member.user_id) ?? null)

        return {
          discord_id: member.user_id,
          username: member.username,
          display_name: member.display_name,
          avatar_url: member.avatar_url,
          strikes: userStrikes,
          active_ban: activeBan,
          total_strike_points: userStrikes.reduce(
            (sum, s) => sum + s.amount,
            0,
          ),
          latest_strike_at: userStrikes[0]?.issued_at ?? null,
        }
      })

      return c.json(
        {
          data,
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        200,
      )
    } catch (error) {
      console.error('Error listing members:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

export { moderationRouter }

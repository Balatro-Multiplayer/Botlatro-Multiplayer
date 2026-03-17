import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { MessageFlags } from 'discord.js'
import { client } from '../../../client'

const monitoringRouter = new OpenAPIHono()

const CHEAT_WARNING_CHANNEL_ID = '1373060718861226095'

const offenderSchema = z.object({
  player_name: z.string().trim().min(1).max(200),
  amount: z.number().finite().nonnegative(),
  role: z.enum(['logOwner', 'opponent']),
})

const cheatFlagSchema = z.object({
  game_index: z.number().int().min(0),
  deck: z.string().trim().min(1).max(200),
  game_mode: z.string().trim().min(1).max(200),
  threshold: z.number().finite().nonnegative(),
  offenders: z.array(offenderSchema).min(1),
  start_date: z.string().datetime().nullable(),
})

const cheatWarningBodySchema = z.object({
  log_file_id: z.number().int().positive(),
  log_url: z.string().url(),
  flags: z.array(cheatFlagSchema).min(1),
})

const successSchema = z.object({
  success: z.literal(true),
})

const errorSchema = z.object({
  error: z.string(),
})

const sendCheatWarningRoute = createRoute({
  method: 'post',
  path: '/cheat-warning',
  tags: ['Monitoring'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: cheatWarningBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Cheat warning sent',
      content: {
        'application/json': {
          schema: successSchema,
        },
      },
    },
    500: {
      description: 'Failed to send cheat warning',
      content: {
        'application/json': {
          schema: errorSchema,
        },
      },
    },
  },
})

function formatCurrency(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function formatFlagLine(
  flag: z.infer<typeof cheatFlagSchema>,
  logUrl: string,
) {
  const offenders = flag.offenders
    .map((offender) => `${offender.player_name} $${formatCurrency(offender.amount)}`)
    .join(', ')
  const start = flag.start_date
    ? ` at ${new Date(flag.start_date).toISOString()}`
    : ''
  const gameUrl = new URL(logUrl)
  gameUrl.searchParams.set('game', flag.game_index.toString())

  return `Game ${flag.game_index + 1} | ${flag.game_mode} | ${flag.deck} deck | threshold $${formatCurrency(flag.threshold)} | ${offenders}${start} | ${gameUrl.toString()}`
}

monitoringRouter.openapi(sendCheatWarningRoute, async (c) => {
  try {
    const body = c.req.valid('json')
    const channel = await client.channels.fetch(CHEAT_WARNING_CHANNEL_ID)

    if (!channel?.isTextBased() || !('send' in channel)) {
      return c.json(
        { error: 'Cheat warning channel unavailable' },
        500,
      )
    }

    const content = [
      `Warning: suspicious first shop spend detected in uploaded log #${body.log_file_id}`,
      `Log: ${body.log_url}`,
      ...body.flags.map((flag) => formatFlagLine(flag, body.log_url)),
    ].join('\n')

    await channel.send({
      content,
      flags: MessageFlags.SuppressEmbeds,
    })

    return c.json({ success: true as const }, 200)
  } catch (error) {
    console.error('Failed to send cheat warning:', error)
    return c.json({ error: 'Failed to send cheat warning' }, 500)
  }
})

export { monitoringRouter }

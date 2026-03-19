import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { MessageFlags } from 'discord.js'
import { client } from '../../../client'

const monitoringRouter = new OpenAPIHono()

const WARNING_CHANNEL_ID = '1373060718861226095'

const warningBodySchema = z.object({
  title: z.string().trim().min(1).max(500),
  lines: z.array(z.string().trim().min(1).max(2000)).min(1),
})

const successSchema = z.object({
  success: z.literal(true),
})

const errorSchema = z.object({
  error: z.string(),
})

const sendWarningRoute = createRoute({
  method: 'post',
  path: '/warning',
  tags: ['Monitoring'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: warningBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Warning sent',
      content: {
        'application/json': {
          schema: successSchema,
        },
      },
    },
    500: {
      description: 'Failed to send warning',
      content: {
        'application/json': {
          schema: errorSchema,
        },
      },
    },
  },
})

monitoringRouter.openapi(sendWarningRoute, async (c) => {
  try {
    const body = c.req.valid('json')
    const channel = await client.channels.fetch(WARNING_CHANNEL_ID)

    if (!channel?.isTextBased() || !('send' in channel)) {
      return c.json({ error: 'Warning channel unavailable' }, 500)
    }

    const content = [body.title, ...body.lines].join('\n')

    await channel.send({
      content,
      flags: MessageFlags.SuppressEmbeds,
    })

    return c.json({ success: true as const }, 200)
  } catch (error) {
    console.error('Failed to send warning:', error)
    return c.json({ error: 'Failed to send warning' }, 500)
  }
})

export { monitoringRouter }

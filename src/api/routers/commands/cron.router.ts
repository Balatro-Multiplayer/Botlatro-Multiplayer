// src/routers/commands/cron.router.ts
import { OpenAPIHono } from '@hono/zod-openapi'
import { health } from '../../../testCron'

const cronRouter = new OpenAPIHono()

const CRON_SECRET = process.env.CRON_SECRET || 'test-secrt'

cronRouter.post('/run-task', async (c) => {
  const key = c.req.header('x-cron-key')
  if (key !== CRON_SECRET) {
    console.log('Unauthorized')
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const result = await health()
    return c.json(
      { success: true, time: new Date().toISOString(), result },
      404,
    )
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

export { cronRouter }

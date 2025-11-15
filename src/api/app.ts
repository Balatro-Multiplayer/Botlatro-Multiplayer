import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { bearerAuth } from 'hono/bearer-auth'
import { matchesRouter } from './routers/commands/matches.router'
import { queuesRouter } from './routers/commands/queues.router'
import { cronRouter } from './routers/commands/cron.router'
import { statsRouter } from './routers/commands/stats.router'
import { playersRouter } from './routers/commands/players.router'

const app = new OpenAPIHono({ strict: false })
const token = process.env.API_TOKEN

if (!token) {
  console.error('no token you dumb fuck')
  process.exit(1)
}

app.get('/', (c) => c.text('Hello Bun!'))
app.doc('/swagger', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'NKQueue API',
  },
})
app.get('/docs', Scalar({ url: '/swagger' }))

// Public routes (no auth required)
app.route('/api/stats', statsRouter)
app.route('/api/players', playersRouter)

// Protected routes (auth required)
app.use('/api/matches/*', bearerAuth({ token }))
app.use('/api/queues/*', bearerAuth({ token }))
app.use('/api/cron/*', bearerAuth({ token }))

app.route('/api/matches', matchesRouter)
app.route('/api/queues', queuesRouter)
app.route('/api/cron', cronRouter)
export { app }

import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { bearerAuth } from 'hono/bearer-auth'
import { matchesRouter } from './routers/commands/matches.router'
import { queuesRouter } from './routers/commands/queues.router'
import { cronRouter } from './routers/commands/cron.router'
import { statsRouter } from './routers/commands/stats.router'
import { playersRouter } from './routers/commands/players.router'
import { transcriptsRouter } from './routers/commands/transcriptsRouter'
import { bountiesRouter } from './routers/commands/bounties.router'
import { moderationRouter } from './routers/commands/moderation.router'
import { monitoringRouter } from './routers/commands/monitoring.router'
import { usersRouter } from './routers/commands/users.router'

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
app.route('/api/bounties', bountiesRouter)

// Protected routes (auth required)
app.use('/api/matches/*', bearerAuth({ token }))
app.use('/api/queues/*', bearerAuth({ token }))
app.use('/api/cron/*', bearerAuth({ token }))
app.use('/api/transcripts/*', bearerAuth({ token }))
app.use('/api/moderation/*', bearerAuth({ token }))
app.use('/api/monitoring/*', bearerAuth({ token }))
app.use('/api/users/*', bearerAuth({ token }))

app.route('/api/matches', matchesRouter)
app.route('/api/queues', queuesRouter)
app.route('/api/cron', cronRouter)
app.route('/api/transcripts', transcriptsRouter)
app.route('/api/moderation', moderationRouter)
app.route('/api/monitoring', monitoringRouter)
app.route('/api/users', usersRouter)
export { app }

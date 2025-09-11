import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { matchesRouter } from './routers/commands/matches.router'
const app = new OpenAPIHono({ strict: false })

app.get('/', (c) => c.text('Hello Bun!'))
app.doc('/swagger', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'NKQueue API',
  },
})
app.get('/docs', Scalar({ url: '/swagger' }))
app.route('/api/matches', matchesRouter)
app.route('/api/queues', queuesRouter)
export { app }

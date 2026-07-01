import { Pool } from 'pg'

const explicitDatabaseUrl = process.env.DATABASE_URL?.trim()
const connectionString =
  explicitDatabaseUrl && explicitDatabaseUrl.length > 0
    ? explicitDatabaseUrl
    : require('./env').env.DATABASE_URL

export const pool = new Pool({
  connectionString,
  max: 30, // Increase pool size from default 10 to handle bot + API load
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Fail fast if no connection available
  allowExitOnIdle: false, // Keep pool alive
  // Guarantee no single query or stalled transaction can hold a pool connection
  // forever. Without these, one hung query (a slow scan, or a transaction blocked
  // on the FOR UPDATE row locks in match creation) pins a connection until the
  // pool is fully exhausted and never recovers.
  statement_timeout: 15000, // Postgres aborts any query running > 15s
  query_timeout: 15000, // Client-side backstop if the server/connection is unresponsive
  idle_in_transaction_session_timeout: 15000, // Kill transactions that BEGIN then stall, freeing their locks
})

// Surface errors on idle pool clients — otherwise a dropped connection can
// leave the pool in a bad state without any log line explaining why.
pool.on('error', (err) => {
  console.error('[pool] idle client error:', err)
})

// Periodically log pool health so a connection leak is visible: if `total`
// pins at max, `idle` sits at 0, and `waiting` climbs, clients are being
// checked out and never released. Runs every 15s; unref() so it never keeps
// the process alive on its own.
setInterval(() => {
  console.log(
    `[pool] total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`,
  )
}, 30000).unref()

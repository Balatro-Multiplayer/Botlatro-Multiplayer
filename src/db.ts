import { Pool } from 'pg'

const explicitDatabaseUrl = process.env.DATABASE_URL?.trim()
const connectionString =
  explicitDatabaseUrl && explicitDatabaseUrl.length > 0
    ? explicitDatabaseUrl
    : require('./env').env.DATABASE_URL

export const pool = new Pool({
  connectionString,
  max: 20, // Increase pool size from default 10 to handle bot + API load
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Fail fast if no connection available
  allowExitOnIdle: false, // Keep pool alive
})

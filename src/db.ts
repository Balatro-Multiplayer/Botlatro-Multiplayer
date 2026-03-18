import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Increase pool size from default 10 to handle bot + API load
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Fail fast if no connection available
  allowExitOnIdle: false, // Keep pool alive
})

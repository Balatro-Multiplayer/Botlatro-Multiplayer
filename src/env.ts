import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const envSchema = z.object({
  API_TOKEN: z.string().trim().min(1, 'API_TOKEN is required'),
  ASSETS_DIR: z.preprocess(
    emptyStringToUndefined,
    z.string().default(path.join(process.cwd(), 'assets')),
  ),
  CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().default('')),
  CRON_SECRET: z.preprocess(
    emptyStringToUndefined,
    z.string().default('test-secret'),
  ),
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
  DISCORD_TOKEN: z.string().trim().min(1, 'DISCORD_TOKEN is required'),
  FONTS_DIR: z.preprocess(
    emptyStringToUndefined,
    z.string().default(path.join(process.cwd(), 'fonts')),
  ),
  GUILD_ID: z.string().trim().min(1, 'GUILD_ID is required'),
  LOG_DIR: z.preprocess(
    emptyStringToUndefined,
    z.string().default(path.join(process.cwd(), 'logs')),
  ),
  NODE_ENV: z.preprocess(
    emptyStringToUndefined,
    z.enum(['development', 'production', 'test']).default('production'),
  ),
  PORT: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(4931),
  ),
  WEBHOOK_QUERY_SECRET: z.preprocess(
    emptyStringToUndefined,
    z.string().optional(),
  ),
  WEBHOOK_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional(),
  ),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  console.error('Invalid env:')
  for (const issue of parsedEnv.error.issues) {
    console.error(`- ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsedEnv.data

export type Env = typeof env

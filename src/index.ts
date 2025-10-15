/// <reference path="./@types/discord.d.ts" />
import './register-paths'
import {
  // deleteOldTranscriptsCronJob,
  // partyDeleteCronJob,
  runDecayTick,
  updateMatchCountCronJob,
  deleteExpiredStrikesCronJob,
} from './utils/cronJobs'
import { app } from './api/app'
import { client } from './client'

import fs from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import { setupClientCommands } from 'setupCommands'

dotenv.config()

process.on('uncaughtException', (error: Error) => {
  console.error('[UNCAUGHT EXCEPTION]', error)
  console.error('Stack:', error.stack)
})

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[UNHANDLED REJECTION]', reason)
  console.error('Promise:', promise)
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack)
  }
})

setupClientCommands(client)

const token = process.env.DISCORD_TOKEN || ''

client.removeAllListeners()
const eventsPath = path.join(__dirname, 'events')
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file)
  const event = require(filePath).default
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args))
  } else {
    client.on(event.name, (...args) => event.execute(...args))
  }
}

client.on('error', (error: Error) => {
  console.error('[DISCORD CLIENT ERROR]', error)
  console.error('Stack:', error.stack)
})

void client.login(token).catch((error) => {
  console.error('[LOGIN FAILED]', error)
  process.exit(1)
})
setupClientCommands(client, false)
void runDecayTick().catch((error) => console.error('[DECAY TICK ERROR]', error))
//void partyDeleteCronJob()
//void deleteOldTranscriptsCronJob()
void updateMatchCountCronJob().catch((error) =>
  console.error('[MATCH COUNT CRON ERROR]', error),
)
void deleteExpiredStrikesCronJob().catch((error) =>
  console.error('[STRIKES CRON ERROR]', error),
)

export default app

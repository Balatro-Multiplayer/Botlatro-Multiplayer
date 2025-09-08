/// <reference path="./@types/discord.d.ts" />
import fs from 'node:fs'
import path from 'node:path'
import {
  deleteOldTranscriptsCronJob,
  partyDeleteCronJob,
} from './utils/cronJobs'
import { client } from './client'
import { app } from './api/app'

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

client.login(process.env.DISCORD_TOKEN)

// todo: cron jobs should be managed by a separate service, internal crons are unreliable
partyDeleteCronJob()
deleteOldTranscriptsCronJob()

export default app

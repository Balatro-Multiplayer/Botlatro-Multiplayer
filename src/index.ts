/// <reference path="./@types/discord.d.ts" />
import {
  deleteOldTranscriptsCronJob,
  partyDeleteCronJob,
} from './utils/cronJobs'
import { app } from './api/app'
import { client } from './client'

import fs from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import { setupClientCommands } from 'setupCommands'

dotenv.config()

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

void client.login(token)
setupClientCommands(client, false)
void partyDeleteCronJob()
void deleteOldTranscriptsCronJob()

export default app

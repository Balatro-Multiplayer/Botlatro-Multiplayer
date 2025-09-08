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

declare global {
  var __clientLoggedIn: boolean | null;
}

require('dotenv').config()
dotenv.config()

setupClientCommands(client);

const token = process.env.DISCORD_TOKEN || ''

client.removeAllListeners();
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

if (!globalThis.__clientLoggedIn) {
  client.login(token);
  setupClientCommands(client, true);
  partyDeleteCronJob()
  deleteOldTranscriptsCronJob()
  globalThis.__clientLoggedIn = true;
}

export default app

/// <reference path="./@types/discord.d.ts" />
import { REST, Routes } from 'discord.js'
import * as dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import {
  deleteOldTranscriptsCronJob,
  partyDeleteCronJob,
} from './utils/cronJobs'
import { client } from './client'
import { app } from './app'
require('dotenv').config()

dotenv.config()

const token = process.env.DISCORD_TOKEN || ''
const clientId = process.env.CLIENT_ID || ''
const guildId = process.env.GUILD_ID || ''

const commands = []
const foldersPath = path.join(__dirname, 'commands')
const commandFolders = fs.readdirSync(foldersPath)

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder)
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file)
    const command = require(filePath).default

    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON())
      client.commands.set(command.data.name, command)
    } else if (!filePath.includes('commands')) {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
      )
    }
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token)

// and deploy your commands!
;(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`,
    )

    // The put method is used to fully refresh all commands in the guild with the current set
    const data: any = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    )

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`,
    )
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error)
  }
})()

const eventsPath = path.join(__dirname, 'events')
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file)
  const event = require(filePath)
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

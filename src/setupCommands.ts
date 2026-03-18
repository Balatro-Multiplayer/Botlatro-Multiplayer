import { Client } from 'discord.js'
import fs from 'node:fs'
import path from 'node:path'
import { REST, Routes } from 'discord.js'
import * as dotenv from 'dotenv'
import { attachDiscordRateLimitLogging } from './utils/discordRateLimitLogger'
require('dotenv').config()
dotenv.config()

type DiscordApplication = {
  id: string
  name?: string
}

export function setupClientCommands(client: Client, deploy: boolean = false) {
  const token = process.env.DISCORD_TOKEN || ''
  const clientId = process.env.CLIENT_ID || ''
  const guildId = process.env.GUILD_ID || ''

  const commands = []
  const foldersPath = path.join(__dirname, 'commands')
  const commandFolders = fs.readdirSync(foldersPath)

  client.commands.clear()

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder)
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file)

      delete require.cache[require.resolve(filePath)]
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

  if (deploy) {
    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(token)
    attachDiscordRateLimitLogging(rest, 'command-deploy')

    // and deploy your commands!
    return (async () => {
      console.log(
        `Started refreshing ${commands.length} application (/) commands.`,
      )

      if (!token) {
        throw new Error('Missing DISCORD_TOKEN')
      }

      if (!guildId) {
        throw new Error('Missing GUILD_ID')
      }

      const application = (await rest.get(
        Routes.oauth2CurrentApplication(),
      )) as DiscordApplication
      const resolvedClientId = application.id

      if (clientId && clientId !== resolvedClientId) {
        console.warn(
          `[COMMAND DEPLOY] CLIENT_ID mismatch. env=${clientId} token_app=${resolvedClientId}. Using token app.`,
        )
      }

      // The put method is used to fully refresh all commands in the guild with the current set
      const data: any = await rest.put(
        Routes.applicationGuildCommands(resolvedClientId, guildId),
        { body: commands },
      )

      console.log(
        `Successfully reloaded ${data.length} application (/) commands.`,
      )
    })()
  }
}

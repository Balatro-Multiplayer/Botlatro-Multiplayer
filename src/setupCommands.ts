import { Client } from 'discord.js'
import fs from 'node:fs'
import path from 'node:path'
import { REST, Routes } from 'discord.js'
import * as dotenv from 'dotenv'
import { attachDiscordRateLimitLogging } from './utils/discordRateLimitLogger'
require('dotenv').config()
dotenv.config()

export function setupClientCommands(client: Client, deploy: boolean = false) {

    const token = process.env.DISCORD_TOKEN || ''
    const clientId = process.env.CLIENT_ID || ''
    const guildId = process.env.GUILD_ID || ''

    const commands = []
    const foldersPath = path.join(__dirname, 'commands')
    const commandFolders = fs.readdirSync(foldersPath)

    client.commands.clear();
    
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
    }
}

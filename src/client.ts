import { Client, Collection, GatewayIntentBits, Guild } from 'discord.js'
import { env } from './env'

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})
client.commands = new Collection()

export const getGuild = async (): Promise<Guild> => {
  return (
    client.guilds.cache.get(env.GUILD_ID) ??
    (await client.guilds.fetch(env.GUILD_ID))
  )
}

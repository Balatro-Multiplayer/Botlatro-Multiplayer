import { Client, Collection, GatewayIntentBits, Guild, Options } from 'discord.js'
import { env } from './env'

export const client: Client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  // Transcript generation fetches hundreds of messages per match channel into an
  // otherwise-unbounded cache, which grew until the container ran out of memory.
  // Cap the per-channel message cache and periodically sweep stale entries.
  // NOTE: GuildMemberManager is intentionally left at its default (unbounded) so
  // role reads keep hitting the cache instead of triggering rate-limited fetches.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 25,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 300, // run every 5 minutes
      lifetime: 900, // drop messages older than 15 minutes from cache
    },
    users: {
      interval: 3600, // run hourly
      filter: () => (user) => user.bot && user.id !== client.user?.id,
    },
  },
})
client.commands = new Collection()

export const getGuild = async (): Promise<Guild> => {
  return (
    client.guilds.cache.get(env.GUILD_ID) ??
    (await client.guilds.fetch(env.GUILD_ID))
  )
}

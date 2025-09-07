import { Collection, Client } from 'discord.js'

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, any>
  }
}

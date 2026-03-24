import { Events, type GuildMember, type PartialGuildMember } from 'discord.js'

export default {
  name: Events.GuildMemberRemove,
  once: false,
  async execute(_member: GuildMember | PartialGuildMember) {
    // Intentionally keeping guild_members row so match history
    // and player profiles remain accessible on the website.
  },
}

import { Events, type GuildMember, type PartialGuildMember } from 'discord.js'
import { upsertGuildMember } from '../utils/guildMemberSync'

export default {
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(_old: GuildMember | PartialGuildMember, member: GuildMember) {
    await upsertGuildMember(member)
  },
}

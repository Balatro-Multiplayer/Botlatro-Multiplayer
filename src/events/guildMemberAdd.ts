import { Events, type GuildMember } from 'discord.js'
import { upsertGuildMember } from '../utils/guildMemberSync'

export default {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member: GuildMember) {
    await upsertGuildMember(member)
  },
}

import { Events, type GuildMember, type PartialGuildMember } from 'discord.js'
import { removeGuildMember } from '../utils/guildMemberSync'

export default {
  name: Events.GuildMemberRemove,
  once: false,
  async execute(member: GuildMember | PartialGuildMember) {
    await removeGuildMember(member.id)
  },
}

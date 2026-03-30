import type { GuildMember } from 'discord.js'
import { pool } from '../db'
import { getGuild } from '../client'

export async function syncAllGuildMembers() {
  const guild = await getGuild()
  console.log(
    `[GUILD SYNC] Fetching all members from guild (${guild.memberCount} expected)...`,
  )

  let after = '0'
  let totalSynced = 0
  const chunkSize = 1000

  while (true) {
    const chunk = await guild.members.list({ limit: chunkSize, after })
    if (chunk.size === 0) break

    await upsertGuildMembers([...chunk.values()])
    totalSynced += chunk.size

    if (chunk.size < chunkSize) break
    after = chunk.last()!.id
  }

  console.log(`[GUILD SYNC] Done. ${totalSynced} members synced.`)
}

export async function upsertGuildMember(member: GuildMember) {
  const avatarUrl = member.user.displayAvatarURL({
    extension: 'png',
    size: 128,
  })
  await pool.query(
    `INSERT INTO guild_members (user_id, username, display_name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url`,
    [member.id, member.user.username, member.displayName, avatarUrl],
  )
}

export async function upsertGuildMembers(members: GuildMember[]) {
  if (members.length === 0) return

  const values: string[] = []
  const params: unknown[] = []

  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    const offset = i * 4
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`,
    )
    params.push(
      m.id,
      m.user.username,
      m.displayName,
      m.user.displayAvatarURL({ extension: 'png', size: 128 }),
    )
  }

  await pool.query(
    `INSERT INTO guild_members (user_id, username, display_name, avatar_url)
     VALUES ${values.join(', ')}
     ON CONFLICT (user_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url`,
    params,
  )
}

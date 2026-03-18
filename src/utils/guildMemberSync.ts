import type { GuildMember } from 'discord.js'
import { pool } from '../db'
import { getGuild } from '../client'

export async function syncAllGuildMembers() {
  const guild = await getGuild()
  console.log(
    `[GUILD SYNC] Fetching all members from guild (${guild.memberCount} expected)...`,
  )

  const members = await guild.members.fetch()
  console.log(
    `[GUILD SYNC] Fetched ${members.size} members, upserting to DB...`,
  )

  const batchSize = 500
  const memberArray = [...members.values()]

  for (let i = 0; i < memberArray.length; i += batchSize) {
    const batch = memberArray.slice(i, i + batchSize)
    await upsertGuildMembers(batch)
  }

  // Remove members no longer in the guild
  const allIds = memberArray.map((m) => m.id)
  await pool.query(
    `DELETE FROM guild_members WHERE user_id != ALL($1::text[])`,
    [allIds],
  )

  console.log(`[GUILD SYNC] Done. ${members.size} members synced.`)
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

export async function removeGuildMember(userId: string) {
  await pool.query(`DELETE FROM guild_members WHERE user_id = $1`, [userId])
}

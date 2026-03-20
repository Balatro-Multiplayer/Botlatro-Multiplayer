import { client } from '../../client'
import { pool } from '../../db'

type GuildMemberRow = {
  username: string | null
  display_name: string | null
}

type ModerationTarget = {
  displayName: string
  username: string
  mention: string
  fullLabel: string
}

function normalizeName(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function resolveModerationTarget(
  userId: string,
): Promise<ModerationTarget> {
  const dbUser = await pool
    .query<GuildMemberRow>(
      `
        SELECT username, display_name
        FROM guild_members
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId],
    )
    .then((res) => res.rows[0] ?? null)
    .catch(() => null)

  const dbDisplayName = normalizeName(dbUser?.display_name)
  const dbUsername = normalizeName(dbUser?.username)
  if (dbDisplayName || dbUsername) {
    const displayName = dbDisplayName ?? dbUsername ?? userId
    const username = dbUsername ?? displayName
    return {
      displayName,
      username,
      mention: `<@${userId}>`,
      fullLabel: `${displayName} (<@${userId}>)`,
    }
  }

  try {
    const user = await client.users.fetch(userId)
    const username = normalizeName(user.username) ?? userId
    const displayName =
      normalizeName(user.globalName) ?? username ?? userId

    return {
      displayName,
      username,
      mention: `<@${userId}>`,
      fullLabel: `${displayName} (<@${userId}>)`,
    }
  } catch {
    return {
      displayName: userId,
      username: userId,
      mention: `<@${userId}>`,
      fullLabel: `${userId} (<@${userId}>)`,
    }
  }
}

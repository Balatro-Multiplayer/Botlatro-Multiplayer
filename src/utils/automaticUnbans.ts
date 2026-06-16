// unban users if ban is timed out
import { moderationMessages } from '../config/moderationMessages'
import { pool } from '../db'
import type { Bans } from 'psqlDB'
import { logModerationEvent } from './logModerationEvent'
import { sendDm } from './sendDm'
import { createEmbedType, logStrike } from './logCommandUse'
import { getGuild } from '../client'

export async function automaticUnban(ban: Bans) {
  // Keep the ban row as a permanent record, but mark its expiry as handled so
  // the one-time side effects below (role removal, DM, log) only run once.
  const userId = ban.user_id.toString()
  await pool.query(`UPDATE "bans" SET expiry_handled = true WHERE id = $1`, [
    ban.id,
  ])
  await sendDm(userId, moderationMessages.banLiftedDm({ expired: true }))

  const guild = await getGuild()
  // Added member fetch to remove blacklisted roles when unbanning a user whose ban has expired.
  const member = await guild.members.fetch(userId).catch(() => null)
  const username = member?.displayName ?? userId

  if (member) {
    await Promise.all([
      member.roles.remove('1354296037094854788'),
      member.roles.remove('1344793211146600530'),
    ])
  } else {
    console.log(
      `Failed to fetch member for unbanned user ${userId}, perhaps they left the server?`,
    )
  }

  // log ban removal
  const embedType = createEmbedType(
    `Ban removed for ${username}`,
    '',
    16776960, // green
    [
      {
        name: 'Reason:',
        value: `Ban expired at ${ban.expires_at ? `<t:${ban.expires_at.getTime() / 1000}:D>` : 'unknown'}.`,
        inline: true,
      },
    ],
    null,
    `Server`,
  )
  await logStrike('general', embedType)
  await logModerationEvent({
    action: 'ban_expire',
    moderatorId: 'system',
    targetId: userId,
    details: {
      banId: ban.id,
      originalReason: ban.reason,
      expiredAt: ban.expires_at?.toISOString() ?? null,
    },
  })
}

// check all bans for timeout. todo: replace with an api call from external service that is running a cronjob
export async function checkBans() {
  // Only pick up bans that have expired and whose expiry has not yet been
  // handled (permanent bans have expires_at NULL and are never selected).
  const res = await pool.query<Bans>(
    `SELECT * FROM "bans"
     WHERE expires_at IS NOT NULL
       AND expires_at < NOW()
       AND expiry_handled = false`,
  )

  // unban user
  for (const expiredBan of res.rows) {
    await automaticUnban(expiredBan)
  }
}

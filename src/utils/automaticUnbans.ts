// unban users if ban is timed out
import { moderationMessages } from '../config/moderationMessages'
import { pool } from '../db'
import type { Bans } from 'psqlDB'
import { logModerationEvent } from './logModerationEvent'
import { sendDm } from './sendDm'
import { createEmbedType, logStrike } from './logCommandUse'
import { getGuild } from '../client'

export async function automaticUnban(ban: Bans) {
  // remove ban
  const userId = ban.user_id.toString()
  await pool.query(`DELETE FROM "bans" WHERE user_id = $1`, [userId])
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
  const res = await pool.query('SELECT * FROM "bans"')

  const bans = res.rows
  const currentTime = Date.now()

  // filter for bans that have expired
  const expiredBans = bans.filter(
    (ban: Bans): ban is Bans =>
      !!ban.expires_at && ban.expires_at.getTime() < currentTime,
  )

  // unban user
  for (const expiredBan of expiredBans) {
    await automaticUnban(expiredBan)
  }
}

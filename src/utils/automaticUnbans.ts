// unban users if ban is timed out
import { pool } from '../db'
import type { Bans } from 'psqlDB'
import { createEmbedType, logStrike } from './logCommandUse'

export async function automaticUnban(ban: Bans) {
  // log ban removal
  const embedType = createEmbedType(
    `Ban removed for <@${ban.user_id}>`,
    '',
    16776960, // green
    [
      {
        name: 'Reason:',
        value: `Ban expired at ${ban.expires_at ? `t:${ban.expires_at.getTime()}:D` : 'unknown'}.`,
        inline: true,
      },
    ],
    null,
    `Server`,
  )
  await logStrike('general', embedType)
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

  console.log('Expired bans:', expiredBans)

  // unban user
  for (const expiredBan of expiredBans) {
    await automaticUnban(expiredBan)
  }
}

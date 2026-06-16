import { Events, type GuildMember } from 'discord.js'
import { upsertGuildMember } from '../utils/guildMemberSync'
import { pool } from '../db'

// Blacklist roles used for ban visibility + tournament blacklisting.
// Kept in sync with createBan / removeBan / automaticUnbans.
const BLACKLIST_ROLE_IDS = ['1354296037094854788', '1344793211146600530']

export default {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member: GuildMember) {
    await upsertGuildMember(member)

    // Re-apply blacklist roles if the user still has an active ban in the DB.
    // Discord strips all roles when a member leaves, so without this a banned
    // user could leave and rejoin to shed the blacklist roles (and escape
    // tournament blacklisting) even though the DB ban persists.
    const activeBan = await pool.query(
      `SELECT 1 FROM bans
       WHERE user_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [member.id],
    )

    if (activeBan.rowCount && activeBan.rowCount > 0) {
      await Promise.all(
        BLACKLIST_ROLE_IDS.map((roleId) =>
          member.roles.add(roleId).catch((err) => {
            console.error(
              `[BAN REAPPLY] Failed to re-add role ${roleId} to ${member.id}:`,
              err,
            )
          }),
        ),
      )
    }
  },
}

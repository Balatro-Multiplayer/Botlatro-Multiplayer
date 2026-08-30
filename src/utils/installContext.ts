import { env } from '../env'

/**
 * User-install safety boundary.
 *
 * The bot is a single-guild application: it only ever writes state on behalf of
 * the home guild (env.GUILD_ID). When the app is *personally* installed by a
 * user, its commands can be invoked in other servers or in DMs — contexts where
 * the bot is NOT a member and where we must never touch bot state (no DB
 * writes, no role changes, no user rows created), no matter what the user does.
 *
 * "Home" is defined strictly as an interaction whose guildId matches
 * env.GUILD_ID. Everything else (another server via user-install, a DM, a group
 * DM) is "foreign" and must be treated as strictly read-only.
 */
export function isHomeGuild(interaction: { guildId: string | null }): boolean {
  return interaction.guildId === env.GUILD_ID
}

/**
 * Slash command names that are safe to run in a foreign (user-installed)
 * context. Every command listed here MUST be strictly read-only when
 * isHomeGuild() is false — it may only SELECT, never INSERT/UPDATE/DELETE and
 * never mutate Discord state (roles, etc.).
 *
 * Any command NOT in this set is refused outright in a foreign context by the
 * dispatch guard in events/interactionCreate.ts, so a write-capable command can
 * never execute outside the home guild even if it were somehow exposed.
 */
export const USER_INSTALL_COMMANDS: ReadonlySet<string> = new Set([
  'random',
  'stats',
  'bans',
])

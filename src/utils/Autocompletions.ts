import {
  AutocompleteInteraction,
  Channel,
  Guild,
  GuildBasedChannel,
  User,
} from 'discord.js'
import { strikeUtils } from './queryDB'
import { client } from '../client'

const userCache = new Map<string, User>()
const channelCache = new Map<string, Channel | GuildBasedChannel>()
const channelNameCache = new Map<string, string>() // id -> '#name'

async function fetchUserSafe(id: string) {
  if (userCache.has(id)) return userCache.get(id)!
  try {
    const u = await client.users.fetch(id)
    userCache.set(id, u)
    return u
  } catch {
    return null
  }
}

// prefer guild-scoped lookups; fall back to global rest
async function resolveChannel(id: string, guild?: Guild | null) {
  if (channelCache.has(id)) return channelCache.get(id)!

  // 1) guild cache
  const fromGuildCache = guild?.channels.cache.get(id) ?? null
  if (fromGuildCache) {
    channelCache.set(id, fromGuildCache)
    return fromGuildCache
  }

  // 2) guild REST (preserves permission checks)
  try {
    const viaGuild = guild ? await guild.channels.fetch(id) : null
    if (viaGuild) {
      channelCache.set(id, viaGuild)
      return viaGuild
    }
  } catch (e: any) {
    // leave a breadcrumb if perms are borked
    if (e?.status === 403)
      console.warn(
        `[autocomplete] missing access to channel ${id} in guild ${guild?.id}`,
      )
  }

  // 3) global REST (can work across guilds if bot is in them)
  try {
    const ch = await client.channels.fetch(id)
    if (ch) {
      channelCache.set(id, ch)
      return ch
    }
  } catch (e: any) {
    if (e?.status === 403)
      console.warn(`[autocomplete] missing access to channel ${id} (global)`)
  }

  return null
}

async function getChannelLabel(id: string, guild?: Guild | null) {
  if (channelNameCache.has(id)) return channelNameCache.get(id)!
  const ch = await resolveChannel(id, guild)
  const label = ch && 'name' in ch && ch.name ? `#${ch.name}` : `<#${id}>` // only fallback if we truly can’t see it
  channelNameCache.set(id, label)
  return label
}

const ell = (s: string, n: number) =>
  (s ?? '').length > n ? s.slice(0, n - 1) + '…' : (s ?? '')

const digits = /^\d+$/
const userMention = /^<@!?(\d{16,25})>$/
const channelMention = /^<#(\d{16,25})>$/
const prefixed = /^(id|by|reason|ref|reference):\s*(.+)$/i
const stripHash = (s: string) => s.replace(/^#/, '').toLowerCase()

export async function strikeAutocomplete(interaction: AutocompleteInteraction) {
  try {
    const focused = interaction.options.getFocused(true)
    const name = focused.name
    const value = String(focused.value ?? '')
    const guild = interaction.guild ?? null

    if (name === 'user') {
      const userIds = await strikeUtils.getUserIdsWithStrikes()
      const uniqueIds = [...new Set(userIds)]
      const users = await Promise.all(uniqueIds.map((id) => fetchUserSafe(id)))
      const q = value.toLowerCase()
      const entries =
        users
          .filter((u: any): u is User => !!u)
          .filter((u: any) =>
            q
              ? u.username.toLowerCase().includes(q) || u.id.includes(value)
              : true,
          )
          .slice(0, 25)
          .map((u: any) => ({ name: `${u.username}`, value: u.id })) || []
      await interaction.respond(entries)
      return
    }

    if (name === 'strike') {
      const selectedUserId = interaction.options.getString('user')
      if (!selectedUserId) {
        await interaction.respond([
          { name: 'select a user first', value: 'select_user_first' },
        ])
        return
      }

      const strikes = await strikeUtils.getUserStrikes(selectedUserId)

      const issuerIds = [
        ...new Set(strikes.map((s: any) => s.issued_by_id).filter(Boolean)),
      ]
      const refIds = [
        ...new Set(strikes.map((s: any) => s.reference).filter(Boolean)),
      ]

      const [issuers, refLabels] = await Promise.all([
        Promise.all(issuerIds.map((id: string) => fetchUserSafe(id))),
        Promise.all(refIds.map((id: string) => getChannelLabel(id, guild))),
      ])

      const issuerMap = new Map<string, string>()
      issuerIds.forEach((id, i) =>
        issuerMap.set(id, issuers[i]?.username ?? id),
      )

      const refLabelMap = new Map<string, string>() // id -> '#name' or '<#id>'
      const refPlainMap = new Map<string, string>() // id -> 'name' lowercased if known
      refIds.forEach((id, i) => {
        const label = refLabels[i]
        refLabelMap.set(id, label)
        refPlainMap.set(
          id,
          label.startsWith('#') ? label.slice(1).toLowerCase() : '',
        )
      })

      const qraw = value.trim()
      const q = qraw.toLowerCase()
      let filtered = strikes as any[]

      const m = q.match(prefixed)
      if (m) {
        const key = m[1].toLowerCase()
        const val = m[2].trim()
        if (key === 'id') {
          filtered = strikes.filter((s) => String(s.id).includes(val))
        } else if (key === 'by') {
          const v = val.toLowerCase()
          const mU = val.match(userMention)
          const byId = mU ? mU[1] : null
          filtered = strikes.filter((s) => {
            const issuerName = (
              issuerMap.get(s.issued_by_id) || ''
            ).toLowerCase()
            return (
              (byId && s.issued_by_id === byId) ||
              issuerName.includes(v) ||
              s.issued_by_id.includes(val)
            )
          })
        } else if (key === 'reason') {
          const v = val.toLowerCase()
          filtered = strikes.filter((s) =>
            (s.reason || '').toLowerCase().includes(v),
          )
        } else if (key === 'ref' || key === 'reference') {
          const mC = val.match(channelMention)
          const byId = mC ? mC[1] : null
          const needle = stripHash(val)
          filtered = strikes.filter((s) => {
            const plain = refPlainMap.get(s.reference) || ''
            return (byId && s.reference === byId) || plain.includes(needle)
          })
        }
      } else if (userMention.test(q)) {
        const [, id] = q.match(userMention)!
        filtered = strikes.filter((s) => s.issued_by_id === id)
      } else if (digits.test(q)) {
        filtered = strikes.filter((s) => String(s.id).includes(q))
      } else if (q.length > 0) {
        filtered = strikes.filter((s) => {
          const issuer = (issuerMap.get(s.issued_by_id) || '').toLowerCase()
          const reason = (s.reason || '').toLowerCase()
          const refPlain = (refPlainMap.get(s.reference) || '').toLowerCase()
          return (
            issuer.includes(q) || reason.includes(q) || refPlain.includes(q)
          )
        })
      }

      const choices = filtered.slice(0, 25).map((s) => {
        const issuer = issuerMap.get(s.issued_by_id) || s.issued_by_id
        const refLabel = refLabelMap.get(s.reference) || `<#${s.reference}>`
        const issued = s.issued_at ? new Date(s.issued_at) : null
        const stamp = issued ? issued.toISOString().slice(0, 10) : ''
        const label = `#${s.id} by ${issuer} · ${ell(s.reason || '', 40)} · ${refLabel} · ${stamp}`
        return { name: ell(label, 100), value: String(s.id) }
      })

      await interaction.respond(
        choices.length ? choices : [{ name: 'no matches', value: 'none' }],
      )
      return
    }

    await interaction.respond([])
  } catch (err) {
    console.error('autocomplete error:', err)
    if (!interaction.responded) await interaction.respond([])
  }
}

import { AutocompleteInteraction, User } from 'discord.js'
import { getAllOpenRooms, strikeUtils } from './queryDB'
import { client } from '../client'

const userCache = new Map<string, User>()

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

const ell = (s: string, n: number) =>
  (s ?? '').length > n ? s.slice(0, n - 1) + '…' : (s ?? '')

const digits = /^\d+$/
const userMention = /^<@!?(\d{16,25})>$/
const prefixed = /^(id|by|reason|ref|reference):\s*(.+)$/i

export async function strikeAutocomplete(interaction: AutocompleteInteraction) {
  try {
    const focused = interaction.options.getFocused(true)
    const name = focused.name
    const value = String(focused.value ?? '')

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

      const issuers = await Promise.all(
        issuerIds.map((id: string) => fetchUserSafe(id)),
      )

      const issuerMap = new Map<string, string>()
      issuerIds.forEach((id, i) =>
        issuerMap.set(id, issuers[i]?.username ?? id),
      )

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
          const v = val.toLowerCase()
          filtered = strikes.filter((s) =>
            (s.reference || '').toLowerCase().includes(v),
          )
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
          const ref = (s.reference || '').toLowerCase()
          return issuer.includes(q) || reason.includes(q) || ref.includes(q)
        })
      }

      const choices = filtered.slice(0, 25).map((s) => {
        const issuer = issuerMap.get(s.issued_by_id) || s.issued_by_id
        const refLabel = s.reference || 'no channel'
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

export async function roomDeleteAutoCompletion(
  interaction: AutocompleteInteraction,
) {
  const focused = interaction.options.getFocused(true)
  const value = String(focused.value ?? '')

  const options = await getAllOpenRooms()
  const channelNames = await Promise.all(
    options.map(async (option) => {
      if (option.room_id)
        return {
          name:
            (
              await interaction
                .guild!.channels.fetch(option.room_id)
                .catch(() => null)
            )?.name ?? `${option.room_id} (channel doesnt exist)`,
          value: option.room_id,
        }
      return {
        name: `No active rooms`,
        value: ' ',
      }
    }),
  )
  const filtered = channelNames.filter((channelName) =>
    String(channelName.name).toLowerCase().includes(value.toLowerCase()),
  )
  const choices = filtered.slice(0, 25)

  await interaction.respond(choices)
  return
}

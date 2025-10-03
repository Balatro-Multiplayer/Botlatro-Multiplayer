import { getUserStrikes } from './queryDB'
import { client } from '../client'
import { AutocompleteInteraction } from 'discord.js'

export async function strikeSearchAutoComplete(
  value: string,
  userId: string,
  interaction: AutocompleteInteraction,
) {
  try {
    const allStrikes = await getUserStrikes(userId)
    const filteredStrikes = await Promise.all(
      allStrikes.map(async (strike) => {
        const issuedBy = await client.users.fetch(strike.issued_by_id)
        return {
          id: strike.id.toString().includes(value)
            ? `id: ${strike.id.toString()}`
            : null,
          reason: strike.reason.toLowerCase().includes(value.toLowerCase())
            ? `reason: ${strike.reason}`
            : null,
          issuedBy: issuedBy.username.includes(value)
            ? `issued by: ${issuedBy.username}`
            : null,
          ref: strike.reference.toLowerCase().includes(value.toLowerCase())
            ? `reference channel: ${strike.reference}`
            : null,
        }
      }),
    )
    const response = filteredStrikes.map((fs) => {
      if (fs.id || fs.reason || fs.ref || fs.issuedBy)
        return `${fs.id ? fs.id + ' |' : ''} ${fs.reason ? fs.reason + ' |' : ''} ${fs.ref ? fs.ref + ' |' : ''} ${fs.issuedBy ? fs.issuedBy + ' |' : ''}`
      else return ''
    })
    await interaction.respond(
      response
        .slice(0, 25)
        .map((res) => ({
          name: res,
          value: res,
        }))
        .filter((response) => response.value !== ''),
    )
  } catch (err: any) {
    console.log(err)
  }
}

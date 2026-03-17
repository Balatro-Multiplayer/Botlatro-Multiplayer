import { client } from '../client'

export async function sendDm(userId: string, content: string) {
  try {
    const user = await client.users.fetch(userId)
    await user.send(content)
  } catch (error) {
    console.warn(`[DM FAILED] ${userId}`, error)
  }
}

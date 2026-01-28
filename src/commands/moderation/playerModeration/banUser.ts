import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../../db'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()
      const user = interaction.options.getUser('user', true)
      const reason = interaction.options.getString('reason', false)
      const timespan = interaction.options.getNumber('length', true)

      // calculate expiry time in ms from days
      const timespanMs = timespan * 24 * 60 * 60 * 1000

      // add that to current time to get expiry time
      const expiryTime = Date.now() + timespanMs

      // Ban user in db
      const res = await pool.query(
        `
        INSERT INTO "bans" (user_id, reason, allowed_queue_ids, expires_at, related_strike_ids) 
        VALUES ($1, $2, $4, $5, $6)
      `,
        [user.id, reason, [], expiryTime, []], // related strikes are not used as its a manual ban, and date is set manually for the same reason. todo: add individual queue ban logic
      )
    } catch (err: any) {
      console.error(err)
    }
  },
}

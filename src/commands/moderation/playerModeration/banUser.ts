import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../../db'
import { createEmbedType, logStrike } from '../../../utils/logCommandUse'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply()
      const user = interaction.options.getUser('user', true)
      const reason =
        interaction.options.getString('reason', false) ?? 'No reason provided'
      const timespan = interaction.options.getNumber('length', true)

      // calculate expiry time in ms from days
      const timespanMs = timespan * 24 * 60 * 60 * 1000

      // add that to current time to get expiry time
      const expiryTime = new Date(Date.now() + timespanMs)

      // Ban user in db
      const res = await pool.query(
        `
        INSERT INTO "bans" (user_id, reason, allowed_queue_ids, expires_at, related_strike_ids) 
        VALUES ($1, $2, $3, $4, $5)
      `,
        [user.id, reason, [], expiryTime, []], // related strikes are not used as its a manual ban, and date is set manually for the same reason. todo: add individual queue ban logic
      )

      // log ban
      const embedType = createEmbedType(
        `Ban added for ${user.id} for ${timespan} days.`,
        '',
        16711680, // red
        [
          {
            name: 'Reason:',
            value: reason ?? 'No reason provided',
            inline: true,
          },
        ],
        null,
        `${interaction.user.displayName}`,
      )
      await logStrike('general', embedType)

      await interaction.editReply(`User ${user} banned for ${timespan} days`)
    } catch (err: any) {
      console.error(err)
    }
  },
}

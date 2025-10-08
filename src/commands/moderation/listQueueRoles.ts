import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { getAllQueueRoles, getQueueIdFromName } from 'utils/queryDB'
import { client } from 'client'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const queueName = interaction.options.getString('queue-name', true)
      const queueId = await getQueueIdFromName(queueName)
      if (!queueId) {
        await interaction.reply({
          content: 'Invalid queue provided.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const guild =
        client.guilds.cache.get(process.env.GUILD_ID!) ??
        (await client.guilds.fetch(process.env.GUILD_ID!))

      const queueRoles = await getAllQueueRoles(queueId)

      queueRoles.sort((a, b) => {
        if (a.mmr_threshold !== null && b.mmr_threshold !== null) {
          return a.mmr_threshold - b.mmr_threshold
        }

        if (a.leaderboard_min !== null && b.leaderboard_min !== null) {
          return b.leaderboard_min - a.leaderboard_min
        }
        if (a.mmr_threshold !== null) return -1
        if (b.mmr_threshold !== null) return 1
        return 0
      })

      const formattedQueueRoles = queueRoles
        .map((role) => {
          const roleData = guild.roles.cache.get(role.role_id)
          if (roleData) {
            if (
              role.mmr_threshold !== null &&
              role.mmr_threshold !== undefined
            ) {
              return `**${roleData.name}**: ${role.mmr_threshold}+ MMR`
            } else if (
              role.leaderboard_min !== null &&
              role.leaderboard_max !== null
            ) {
              return `**${roleData.name}**: ${role.leaderboard_min}-${role.leaderboard_max} on the Leaderboard`
            }
          } else {
            return `**N/A**`
          }
        })
        .join('\n')

      if (queueRoles.length > 0) {
        await interaction.reply({
          content: `**Queue Roles for ${queueName}**\n${formattedQueueRoles}`,
        })
      } else {
        await interaction.reply({
          content: `No queue roles have been added to this queue.`,
        })
      }
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to list queue roles. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to list queue roles. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

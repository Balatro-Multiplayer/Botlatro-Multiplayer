import { Events } from 'discord.js'
import { getMatchIdFromChannel, getSettings } from '../utils/queryDB'
import { resendMatchWinVote } from '../utils/matchHelpers'
import * as fs from 'fs'
import * as path from 'path'

// Track message count per channel
const channelMessageCounts = new Map<string, number>()

// Helper function to clear message count for a channel
export function clearChannelMessageCount(channelId: string) {
  channelMessageCounts.delete(channelId)
}

export default {
  name: Events.MessageCreate,
  async execute(message: any) {
    try {
      if (message.author.bot) return

      const guild = message.guild
      const channel = message.channel
      const category = channel?.parent
      const content = message.content
      const attachments = message.attachments

      if (!guild || !channel || !category) return

      // check if message is in queue category
      const settings = await getSettings()
      const queueCategory = settings.queue_category_id
      if (category.id !== queueCategory) return

      // ensure message is not in queue channel or queue results channel
      const queueChannelId = settings.queue_channel_id
      const queueResultsChannelId = settings.queue_results_channel_id
      if (channel.id === queueChannelId || channel.id === queueResultsChannelId)
        return

      // Check if this is a match channel
      const matchId = await getMatchIdFromChannel(channel.id)
      if (matchId) {
        // Increment message count
        const currentCount = channelMessageCounts.get(channel.id) || 0
        const newCount = currentCount + 1
        channelMessageCounts.set(channel.id, newCount)

        // Every 15 messages, resend the win vote message
        if (newCount % 15 === 0) {
          await resendMatchWinVote(matchId, channel)
        }
      }

      const outputFilePath: string = path.join(
        __dirname,
        '..',
        'logs',
        `${channel.name}_${channel.id}.log`,
      )
      const hourTime = new Date().toTimeString().split(' ')[0].split(':')
      fs.appendFileSync(
        outputFilePath,
        `[${hourTime[0]}:${hourTime[1]}] ${message.author.tag}: ${content} ${attachments.map((a: any) => a.url).join(' ')}\n`,
        'utf8',
      )
    } catch (err) {
      console.error('Error in messageCreate event:', err)
    }
  },
}

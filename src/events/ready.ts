import { Events, Client } from 'discord.js'
import { incrementEloCronJobAllQueues } from '../utils/cronJobs'
import { initializeChannelPool } from '../utils/channelPool'

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client) {
    await incrementEloCronJobAllQueues()
    console.log('Started up queues.')

    // Initialize the channel pool
    await initializeChannelPool()

    console.log(`Ready! Logged in as ${client.user?.tag}`)
  },
}

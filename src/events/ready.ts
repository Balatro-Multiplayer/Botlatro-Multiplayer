import { Events, Client } from 'discord.js'
import { incrementEloCronJobAllQueues } from '../utils/cronJobs'

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client) {
    await incrementEloCronJobAllQueues()
    console.log('Started up queues.')
    console.log(`Ready! Logged in as ${client.user?.tag}`)
  },
}

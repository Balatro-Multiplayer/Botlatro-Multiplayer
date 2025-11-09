import {
  addIsDecayToUsers,
  applyDecayToUsers,
  getActiveQueues,
  getCurrentEloRangeForUser,
  getQueueSettings,
  getSettings,
  getUserPriorityQueueId,
  getUserQueues,
  getUsersInQueue,
  partyUtils,
  ratingUtils,
  removeIsDecayFromUsers,
  removeUserFromQueue,
  updateCurrentEloRangeForUser,
} from './queryDB'
import { createMatch, timeSpentInQueue } from './queueHelpers'
import { updateMatchCountChannel } from './matchHelpers'
import { pool } from '../db'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import { client } from '../client'

// delete old parties every 5 minutes
export async function partyDeleteCronJob() {
  setInterval(
    async () => {
      const parties = await partyUtils.listAllParties()
      const now = new Date()

      parties.map(async (party) => {
        // delete parties older than 24 hours
        const createdAt = new Date(party.created_at)
        const ageInMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60)
        if (ageInMinutes > 24 * 60) {
          // 24 hours
          console.log(
            `Deleting party ${party.name} (ID: ${party.id}) - reason: Older than 24 hours (${ageInMinutes.toFixed(2)} minutes)`,
          )
          await partyUtils.deleteParty(party.id)
        }

        // delete parties with no members
        else {
          const members = await partyUtils.getPartyUserList(party.id, true)
          if (!members || members.length === 0) {
            console.log(
              `Deleting party ${party.name} (ID: ${party.id}) - reason: No members`,
            )
            await partyUtils.deleteParty(party.id)
          }
        }
      })
    },
    5 * 60 * 1000,
  ) // 5 minutes in milliseconds
}

// increment elo search globally across all queues
export async function incrementEloCronJobAllQueues() {
  const speedDefault = 2
  let isRunning = false

  setInterval(async () => {
    // Skip this iteration if the previous one is still running
    if (isRunning) {
      return
    }

    isRunning = true
    try {
      // get all active queues
      const activeQueues = await getActiveQueues()

      for (const queue of activeQueues) {
        const queueSettings = await getQueueSettings(queue.id, [
          'elo_search_increment',
          'elo_search_speed',
          'elo_search_start',
          'instaqueue_min',
          'instaqueue_max',
        ])
        const increment = queueSettings.elo_search_increment || 1
        const start = queueSettings.elo_search_start || 0
        const instaqueueMin = queueSettings.instaqueue_min
        const instaqueueMax = queueSettings.instaqueue_max

        let usersInQueue = await getUsersInQueue(queue.id)
        // if (usersInQueue.length <= 1) continue

        const candidates: {
          range: number
          userId: string
          elo: number
          queueId: number
          priorityQueueId: number | null
          timeInQueue: string
        }[] = []

        for (const userId of usersInQueue) {
          const elo = await ratingUtils.getPlayerElo(userId, queue.id)
          if (elo === null) continue
          const userTimeSpent = await timeSpentInQueue(userId, queue.id)
          if (userTimeSpent === null) continue
          const userPriorityQueueId = null // Temporary

          const currentRange = await getCurrentEloRangeForUser(userId, queue.id)
          const newRange = (currentRange ?? start) + increment
          await updateCurrentEloRangeForUser(userId, queue.id, newRange)

          candidates.push({
            range: newRange,
            userId,
            elo,
            queueId: queue.id,
            priorityQueueId: userPriorityQueueId,
            timeInQueue: userTimeSpent,
          })
        }

        // find best pair within this queue
        let bestPair: { userId: string; elo: number; queueId: number }[] = []
        let minDiff = Infinity

        for (let i = 0; i < candidates.length; i++) {
          for (let j = i + 1; j < candidates.length; j++) {
            const diff = Math.abs(candidates[i].elo - candidates[j].elo)

            // If both players are within the configured instaqueue range, match them immediately
            // Owen requested this - Jeff
            const bothInInstaQueueRange =
              candidates[i].elo >= instaqueueMin &&
              candidates[i].elo <= instaqueueMax &&
              candidates[j].elo >= instaqueueMin &&
              candidates[j].elo <= instaqueueMax

            let inRange =
              bothInInstaQueueRange ||
              (diff < candidates[i].range && diff < candidates[j].range)

            // Temporarily removing this until its fixed
            // // Time-in-queue check
            // const anyTooRecent = [candidates[i], candidates[j]].some(
            //   (candidate) => {
            //     if (
            //       candidate.queueId === candidate.priorityQueueId ||
            //       candidate.priorityQueueId === null
            //     )
            //       return false
            //
            //     const match = candidate.timeInQueue?.match(
            //       /<t:(\d+)(?::[a-zA-Z])?>/,
            //     )
            //     if (!match) return false
            //
            //     const tsMs = parseInt(match[1], 10) * 1000
            //     const diffMinutes = (Date.now() - tsMs) / 60000
            //
            //     return diffMinutes < 3
            //   },
            // )
            //
            // inRange = inRange && !anyTooRecent

            if (inRange && diff < minDiff) {
              minDiff = diff
              bestPair = [candidates[i], candidates[j]]
            }
          }
        }

        if (bestPair.length === 2) {
          const matchupUsers = bestPair.map((u) => u.userId)

          // remove users from all queues they are in
          // Wait for all removal operations to complete before creating match
          await Promise.all(
            matchupUsers.map(async (userId) => {
              const userQueues = await getUserQueues(userId)
              await Promise.all(
                userQueues.map((queue) =>
                  removeUserFromQueue(queue.id, userId),
                ),
              )
            }),
          )

          // queue them for the match
          await createMatch(matchupUsers, bestPair[0].queueId)
        }
      }
    } catch (err) {
      console.error('Error in global matchmaking:', err)
    } finally {
      // Always release the lock, even if an error occurred
      isRunning = false
    }
  }, speedDefault * 1000)
}

// delete old transcript files in case they dont get deleted  TODO: this should maybe send the data before deleting?
export async function deleteOldTranscriptsCronJob() {
  setInterval(
    async () => {
      const guild = client.guilds.cache.get(process.env.GUILD_ID!)

      const pattern = path
        .join(__dirname, '..', 'logs', `match-*_*.log`)
        .replace(/\\/g, '/')
      const files = await glob(pattern)

      files.map((file) => {
        const channelId = file.split('_').pop()?.replace('.log', '')
        if (!channelId) return
        const channel = guild?.channels.cache.get(channelId) || null
        if (!channel) {
          console.log(`Deleting old transcript file: ${file}`)
          fs.unlinkSync(file)
        }
      })
    },
    5 * 60 * 1000,
  ) // every 5 mins
}

// decay users
export async function runDecayTick() {
  setInterval(
    async () => {
      console.log('DECAY TICK')
      // 0: get data
      const { decay_threshold, decay_interval, decay_grace, decay_amount } =
        await getSettings()
      // 1: all users who have reached decay threshold should have is_decay set to true, and last_decay set to null.
      await addIsDecayToUsers(decay_threshold, decay_grace)
      // 2: all users who have dropped below decay threshold should have is_decay removed, and last_decay set to null.
      await removeIsDecayFromUsers(decay_threshold)
      // 3: all users who still have is_decay == true, and who's last_decay is 'due', should have a decay tick applied, and last_decay set to now. If last_decay is null, set it to the future (after decay_grace)
      await applyDecayToUsers(decay_interval, decay_amount)
    },
    1000 * 60 * 60 * 2, // every 2 hours,
  )
}

// update match count channel every 5 minutes
export async function updateMatchCountCronJob() {
  setInterval(
    async () => {
      await updateMatchCountChannel()
    },
    5 * 60 * 1000,
  ) // every 5 mins
}

// delete expired strikes every 2 hours
export async function deleteExpiredStrikesCronJob() {
  setInterval(
    async () => {
      try {
        const res = await pool.query(
          `DELETE FROM strikes WHERE expires_at < NOW() RETURNING id`,
        )
        const deletedCount = res.rowCount || 0
        if (deletedCount > 0) {
          console.log(`Deleted ${deletedCount} expired strike(s)`)
        }
      } catch (err) {
        console.error('Error deleting expired strikes:', err)
      }
    },
    2 * 60 * 60 * 1000,
  ) // every 2 hours
}

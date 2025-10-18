import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js'
import { pool } from '../db'
import { getGuild } from '../client'
import { getAllUsersInQueue, getSettings } from './queryDB'

const POOL_SIZE = 10 // Number of channels to keep in the pool
const MIN_POOL_SIZE = 5 // Minimum channels before creating more

/**
 * Initializes the channel pool by creating pre-made channels
 * Call this on bot startup
 */
export async function initializeChannelPool(): Promise<void> {
  try {
    console.log('Initializing channel pool...')

    // Check how many channels are already in the pool
    const existingChannels = await pool.query(
      'SELECT COUNT(*) FROM channel_pool WHERE in_use = false',
    )
    const availableCount = parseInt(existingChannels.rows[0].count)

    console.log(`Found ${availableCount} available channels in pool`)

    // Calculate how many we need to create
    const channelsToCreate = POOL_SIZE - availableCount

    if (channelsToCreate <= 0) {
      console.log('Channel pool is already full')
      return
    }

    const guild = await getGuild()
    const amountInQueue = await getAllUsersInQueue()
    if (amountInQueue.length >= 2) {
      console.log('Too many users in queue, waiting to create channels')
      return
    }

    console.log(`Creating ${channelsToCreate} channels for the pool...`)

    // Create channels with a delay between each to avoid rate limiting
    for (let i = 0; i < channelsToCreate; i++) {
      try {
        const channel = await guild.channels.create({
          name: `reserve-channel-${i + 1}`,
          type: ChannelType.GuildText,
          parent: null, // No category for reserve channels
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
        })

        // Add to database pool
        await pool.query(
          'INSERT INTO channel_pool (channel_id, in_use) VALUES ($1, false)',
          [channel.id],
        )

        console.log(
          `Created pooled channel ${i + 1}/${channelsToCreate}: ${channel.id}`,
        )

        // Wait 2 seconds between channel creations to avoid rate limiting
        if (i < channelsToCreate - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      } catch (err) {
        console.error(`Failed to create pooled channel ${i + 1}:`, err)
        // Continue trying to create remaining channels
      }
    }

    console.log('Channel pool initialization complete')
  } catch (err) {
    console.error('Error initializing channel pool:', err)
  }
}

/**
 * Gets an available channel from the pool for a match
 * @param matchId - The match ID that will use this channel
 * @param userIds - Array of user IDs who should have access to the channel
 * @param channelName - Name to set for the channel
 * @returns The text channel, or null if none available
 */
export async function getAvailableChannel(
  matchId: number,
  userIds: string[],
  channelName: string,
): Promise<TextChannel | null> {
  const dbClient = await pool.connect()

  try {
    await dbClient.query('BEGIN')

    // Get an available channel (with row lock to prevent race conditions)
    const result = await dbClient.query(
      `SELECT channel_id FROM channel_pool
       WHERE in_use = false
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    )

    if (result.rows.length === 0) {
      await dbClient.query('ROLLBACK')
      console.warn('No available channels in pool!')
      return null
    }

    const channelId = result.rows[0].channel_id

    // Mark channel as in use
    await dbClient.query(
      'UPDATE channel_pool SET in_use = true, match_id = $1 WHERE channel_id = $2',
      [matchId, channelId],
    )

    await dbClient.query('COMMIT')

    // Configure the channel
    const guild = await getGuild()
    const channel = (await guild.channels.fetch(channelId)) as TextChannel

    if (!channel) {
      console.error(`Channel ${channelId} not found in Discord`)
      // Return it to pool since it's invalid
      await pool.query(
        'UPDATE channel_pool SET in_use = false, match_id = null WHERE channel_id = $1',
        [channelId],
      )
      return null
    }

    const settings = await getSettings()

    // Set up permissions for match users
    const permissionOverwrites = [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      ...userIds.map((userId) => ({
        id: userId,
        allow: [PermissionFlagsBits.ViewChannel],
        type: OverwriteType.Member,
      })),
    ]

    if (settings?.queue_helper_role_id) {
      permissionOverwrites.push({
        id: settings.queue_helper_role_id,
        allow: [PermissionFlagsBits.ViewChannel],
        type: OverwriteType.Role,
      })
    }

    // Get the category for active matches
    const categoryId = settings.queue_category_id
    const backupCat = '1427367817803464914'

    const category = await guild.channels.fetch(categoryId)
    const channelCount =
      category && category.type === ChannelType.GuildCategory
        ? category.children.cache.size
        : 0

    // Update channel name, permissions, and move to match category
    await channel.edit({
      name: channelName,
      parent: channelCount > 45 ? backupCat : categoryId,
      permissionOverwrites: permissionOverwrites,
    })

    console.log(`Assigned channel ${channelId} to match ${matchId}`)

    // Check if pool needs refilling (async, don't wait)
    maintainChannelPool().catch((err) =>
      console.error('Error maintaining channel pool:', err),
    )

    return channel
  } catch (err) {
    await dbClient.query('ROLLBACK')
    console.error('Error getting available channel:', err)
    return null
  } finally {
    dbClient.release()
  }
}

/**
 * Returns a channel to the pool after a match ends
 * @param channelId - The Discord channel ID to return to pool
 */
export async function returnChannelToPool(channelId: string): Promise<void> {
  try {
    const guild = await getGuild()
    const channel = (await guild.channels.fetch(channelId)) as TextChannel

    if (!channel) {
      console.warn(`Channel ${channelId} not found, removing from pool`)
      await pool.query('DELETE FROM channel_pool WHERE channel_id = $1', [
        channelId,
      ])
      return
    }

    // Reset channel to default state (no category, hidden, history hidden)
    await channel.edit({
      name: 'reserve-channel',
      parent: null, // Remove from category
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    })

    // Mark as available in database
    await pool.query(
      'UPDATE channel_pool SET in_use = false, match_id = null WHERE channel_id = $1',
      [channelId],
    )

    console.log(`Returned channel ${channelId} to pool`)
  } catch (err) {
    console.error(`Error returning channel ${channelId} to pool:`, err)
  }
}

/**
 * Maintains the channel pool by creating new channels if below minimum
 * Can be called periodically or after channels are used
 */
export async function maintainChannelPool(): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM channel_pool WHERE in_use = false',
    )
    const availableCount = parseInt(result.rows[0].count)

    if (availableCount >= MIN_POOL_SIZE) {
      return
    }

    console.log(
      `Channel pool low (${availableCount}), creating more channels...`,
    )

    const channelsToCreate = POOL_SIZE - availableCount
    const guild = await getGuild()

    for (let i = 0; i < channelsToCreate; i++) {
      try {
        const channel = await guild.channels.create({
          name: `reserve-channel`,
          type: ChannelType.GuildText,
          parent: null, // No category for reserve channels
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: [PermissionFlagsBits.ViewChannel],
            },
          ],
        })

        await pool.query(
          'INSERT INTO channel_pool (channel_id, in_use) VALUES ($1, false)',
          [channel.id],
        )

        console.log(`Created maintenance channel ${i + 1}/${channelsToCreate}`)

        // Wait 2 seconds between creations
        if (i < channelsToCreate - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      } catch (err) {
        console.error(`Failed to create maintenance channel ${i + 1}:`, err)
      }
    }
  } catch (err) {
    console.error('Error maintaining channel pool:', err)
  }
}

/**
 * Cleans up orphaned channels (channels in pool that no longer exist in Discord)
 */
export async function cleanupChannelPool(): Promise<void> {
  try {
    const result = await pool.query('SELECT channel_id FROM channel_pool')
    const guild = await getGuild()

    for (const row of result.rows) {
      try {
        await guild.channels.fetch(row.channel_id)
      } catch (err) {
        // Channel doesn't exist, remove from pool
        console.log(`Removing orphaned channel ${row.channel_id} from pool`)
        await pool.query('DELETE FROM channel_pool WHERE channel_id = $1', [
          row.channel_id,
        ])
      }
    }
  } catch (err) {
    console.error('Error cleaning up channel pool:', err)
  }
}

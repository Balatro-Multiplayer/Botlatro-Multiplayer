import { pool } from '../db'
import {
  ActionRowBuilder,
  APIEmbedField,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  CommandInteraction,
  EmbedBuilder,
  Message,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from 'discord.js'
import { sendMatchInitMessages } from './matchHelpers'
import {
  createQueueUser,
  getAllQueueRoles,
  getLeaderboardQueueRole,
  getSettings,
  getUserQueueRole,
  getUsersInQueue,
  userInMatch,
  userInQueue,
} from './queryDB'
import { Queues } from 'psqlDB'
import { QueryResult } from 'pg'
import { client } from '../client'

// Updates or sends a new queue message for the specified text channel
export async function updateQueueMessage(): Promise<Message | undefined> {
  const response = await pool.query(
    'SELECT queue_channel_id, queue_message_id FROM settings',
  )

  if (response.rows[0].queue_channel_id === null) {
    throw new Error(
      "No queue channel set in settings, try using '</setup-bot:1414248501956575232>' ",
    )
  }

  const { queue_channel_id: queueChannelId, queue_message_id: queueMessageId } =
    response.rows[0]

  const queueListResponse = await pool.query(`SELECT * from queues`)
  if (queueListResponse.rowCount == 0) return
  let queueList: Queues[] = queueListResponse.rows
  queueList = queueList.filter((queue) => !queue.locked)
  queueList.sort((a, b) => a.id - b.id) // Sort by ID ascending (oldest to newest)
  const queueFields: APIEmbedField[] = await Promise.all(
    queueList.map(async (queue) => {
      const usersInQueue = await getUsersInQueue(queue.id)
      return {
        name: queue.queue_name,
        value: `${usersInQueue.length}`,
        inline: true,
      }
    }),
  )

  const embed = new EmbedBuilder()
    .setTitle(`Balatro Multiplayer Matchmaking Queue`)
    .setDescription(
      `Use the Select Menu to join the queue!\n\n**Current Players In Queue**`,
    )
    .addFields(queueFields)
    .setColor('#ff0000')

  const options: StringSelectMenuOptionBuilder[] = queueList.map((queue) => {
    return new StringSelectMenuOptionBuilder()
      .setLabel(queue.queue_name.slice(0, 100))
      .setDescription((queue.queue_desc || '').slice(0, 100))
      .setValue(queue.id.toString())
  })

  if (options.length == 0) return

  const selectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('join-queue')
        .setPlaceholder('Join Queue')
        .addOptions(options)
        .setMinValues(1)
        .setMaxValues(queueList.length),
    )

  const leaveQueue = new ButtonBuilder()
    .setCustomId(`leave-queue`)
    .setLabel('Leave Queue')
    .setStyle(ButtonStyle.Danger)

  const checkQueued = new ButtonBuilder()
    .setCustomId(`check-queued`)
    .setLabel('Check Queued State')
    .setStyle(ButtonStyle.Secondary)

  const setPriorityQueue = new ButtonBuilder()
    .setCustomId(`set-priority-queue`)
    .setLabel('Set Priority Queue')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true)
  // .setDisabled(options.length < 2)

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    leaveQueue,
    setPriorityQueue,
    checkQueued,
  )

  let queueMsg
  const queueChannel = (await client.channels.fetch(
    queueChannelId,
  )) as TextChannel
  if (queueMessageId) {
    await queueChannel.messages
      .fetch(queueMessageId)
      .then(async (msg) => {
        if (msg.author.id == client.user?.id) {
          queueMsg = await msg.edit({
            embeds: [embed],
            components: [selectRow, buttonRow],
          })
        } else {
          await msg.delete()
        }
      })
      .catch((err) => {
        console.error(err)
      })
  }

  if (!queueMsg) {
    queueMsg = await queueChannel.send({
      embeds: [embed],
      components: [selectRow, buttonRow],
    })
    await pool.query('UPDATE settings SET queue_message_id = $1', [queueMsg.id])
  }

  return queueMsg
}

export async function joinQueues(
  interaction: StringSelectMenuInteraction | CommandInteraction,
  selectedQueueIds: string[],
  userId: string,
): Promise<string[] | null> {
  // Get guild member for role checks
  const guild =
    interaction.client.guilds.cache.get(process.env.GUILD_ID!) ??
    (await interaction.client.guilds.fetch(process.env.GUILD_ID!))
  const member = await guild.members.fetch(userId)

  // Check if user is in a match
  const inMatch = await userInMatch(userId)
  if (inMatch) {
    const matchId = await pool.query(
      `SELECT match_id FROM match_users WHERE user_id = $1`,
      [userId],
    )
    const matchData = await pool.query(`SELECT * FROM matches WHERE id = $1`, [
      matchId.rows[0].match_id,
    ])

    await interaction.followUp({
      content: `You're already in a match! <#${matchData.rows[0].channel_id}>`,
      flags: MessageFlags.Ephemeral,
    })
    return null
  }

  const queueIds = selectedQueueIds.map((id) => parseInt(id))

  const allQueues = await pool.query(
    `SELECT * FROM queues WHERE id = ANY($1::int[])`,
    [queueIds],
  )

  // Create map for O(1) lookups
  const queueMap = new Map(allQueues.rows.map((q) => [q.id, q]))

  const joinedQueues: string[] = []

  // Role lock checks
  for (let qId of selectedQueueIds) {
    const queueId = parseInt(qId)
    const queue = queueMap.get(queueId)
    if (!queue) continue

    // Check role lock (stored in queue.role_lock_id)
    if (queue.role_lock_id && !member.roles.cache.has(queue.role_lock_id)) {
      const role = guild.roles.cache.get(queue.role_lock_id)
      const roleName = role ? role.name : 'required role'
      await interaction.followUp({
        content: `You need the **${roleName}** role to join the ${queue.queue_name} queue.`,
        flags: MessageFlags.Ephemeral,
      })
      return null
    }

    // TODO: check for bans

    // // party checks
    // const partyId = await partyUtils.getUserParty(userId)
    // if (partyId) {
    //   const partyList = await partyUtils.getPartyUserList(partyId)
    //   for (let qId of selectedQueueIds) {
    //     const queueId = parseInt(qId)
    //     const queue = allQueues.rows.find((q) => q.id === queueId)
    //     if (queue && partyList && partyList.length > queue.members_per_team) {
    //       await interaction.followUp({
    //         content: `Your party has too many members for the ${queue.queue_name} queue.`,
    //         flags: MessageFlags.Ephemeral,
    //       })
    //       return null
    //     }
    //   }

    // const isLeader = await pool.query(
    //   `SELECT is_leader FROM party_users WHERE user_id = $1`,
    //   [userId],
    // )
    // if (!(isLeader?.rows[0]?.is_leader ?? null)) {
    //   await interaction.followUp({
    //     content: `You're not the party leader.`,
    //     flags: MessageFlags.Ephemeral,
    //   })
    //   return null
    // }

    joinedQueues.push(queue.queue_name)
  }

  // Batch all database operations in a transaction
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Ensure user exists
    await client.query(
      'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [userId],
    )

    // Batch upsert all queue joins
    for (const qId of selectedQueueIds) {
      const queueId = parseInt(qId)
      const queue = queueMap.get(queueId)
      if (!queue) continue

      await createQueueUser(userId, queueId)
      await client.query(
        `UPDATE queue_users
         SET queue_join_time = NOW(),
             elo = COALESCE(elo, $3),
             peak_elo = COALESCE(peak_elo, $3)
         WHERE user_id = $1 AND queue_id = $2`,
        [userId, queueId, queue.default_elo],
      )
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  return joinedQueues
}

// Matches up users in queues
export async function matchUpGames(): Promise<void> {
  try {
    // Get all users in unlocked queues
    const response = await pool.query(`
      SELECT u.*, q.number_of_teams, q.members_per_team, q.elo_search_start, q.elo_search_speed, q.elo_search_increment
      FROM queue_users u
      JOIN queues q
          ON u.queue_id = q.id
      WHERE u.queue_join_time IS NOT NULL
          AND q.locked = false;
    `)

    // Group users by queue
    const queues: Record<string, any[]> = {}
    for (const row of response.rows) {
      if (!queues[row.queue_channel_id]) queues[row.queue_channel_id] = []
      queues[row.queue_channel_id].push(row)
    }

    let possibleMatches: any[] = []

    for (const [queueId, users] of Object.entries(queues)) {
      // Get queue settings
      const numberOfTeams = users[0].number_of_teams
      const membersPerTeam = users[0].members_per_team
      const totalPlayers = numberOfTeams * membersPerTeam

      if (users.length < totalPlayers) continue

      // Generate all possible combinations of users for a match
      const combinations = getCombinations(users, totalPlayers)

      for (const combo of combinations) {
        // Check ELO difference across the combination
        let minQueueTime = Math.min(
          ...combo.map((u) => new Date(u.queue_join_time).getTime()),
        )

        const userDistance = Math.abs(minQueueTime - Date.now())
        const defaultDistance = users[0].elo_search_start
        const intervalTime = users[0].elo_search_speed * 1000
        const intervalSize = users[0].elo_search_increment

        const secondsInQueue = Math.floor(userDistance / 1000)
        const intervalsPassed = Math.floor(secondsInQueue / intervalTime)
        const allowedDistance = defaultDistance + intervalsPassed * intervalSize

        // Check if users can be matched based on ELO
        const minElo = Math.min(...combo.map((u) => u.elo))
        const maxElo = Math.max(...combo.map((u) => u.elo))
        const eloDifference = Math.abs(maxElo - minElo)
        if (eloDifference > allowedDistance) continue

        possibleMatches.push({ eloDifference, queueId, users: combo })
      }
    }

    possibleMatches.sort((a, b) => a.eloDifference - b.eloDifference)

    const usedUsers: Set<string> = new Set()
    for (const match of possibleMatches) {
      const { users, queueId } = match

      // Check if all users in this match are still available
      if (users.some((u: Record<string, any>) => usedUsers.has(u.user_id)))
        continue

      // Mark users as used in local set
      users.forEach((u: Record<string, any>) => usedUsers.add(u.user_id))

      // Atomically check and remove users from queue to prevent race conditions
      const userIds = users.map((u: Record<string, any>) => u.user_id)
      const dbClient = await pool.connect()
      try {
        await dbClient.query('BEGIN')

        // Lock the rows and check if all users are still in queue
        const checkResult = await dbClient.query(
          `SELECT user_id FROM queue_users
           WHERE user_id = ANY($1::varchar[])
           AND queue_join_time IS NOT NULL
           FOR UPDATE`,
          [userIds],
        )

        // If not all users are still available, skip this match
        if (checkResult.rowCount !== userIds.length) {
          await dbClient.query('ROLLBACK')
          dbClient.release()
          continue
        }

        // Remove users from queue (set queue_join_time to NULL)
        await dbClient.query(
          `UPDATE queue_users SET queue_join_time = NULL
           WHERE user_id = ANY($1::varchar[])`,
          [userIds],
        )

        await dbClient.query('COMMIT')
        dbClient.release()

        // Now create the match (users are already removed from queue)
        await createMatch(userIds, queueId)
      } catch (err) {
        await dbClient.query('ROLLBACK')
        dbClient.release()
        console.error('Error creating match:', err)
      }
    }
  } catch (err) {
    console.error('Error checking for queues:', err)
  }
}

// Returns all combinations of arr of length k
function getCombinations<T>(arr: T[], k: number): T[][] {
  const results: T[][] = []
  function helper(start: number, combo: T[]) {
    if (combo.length === k) {
      results.push([...combo])
      return
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i])
      helper(i + 1, combo)
      combo.pop()
    }
  }
  helper(0, [])
  return results
}

// Queues players together and creates a match channel for them
export async function createMatch(
  userIds: string[],
  queueId: number,
): Promise<any> {
  if (userIds.length === 0 || !queueId) {
    throw new Error('Wrong parameters provided for creating a match')
  }

  // get global settings
  const queue: QueryResult<Queues> = await pool.query(
    'SELECT id FROM queues WHERE id = $1',
    [queueId],
  )
  const settings = await getSettings()
  if (!settings) return

  const guild =
    client.guilds.cache.get(process.env.GUILD_ID!) ??
    (await client.guilds.fetch(process.env.GUILD_ID!))
  if (!guild) throw new Error('Guild not found')

  const categoryId = settings.queue_category_id
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

  if (settings.queue_helper_role_id) {
    permissionOverwrites.push({
      id: settings.queue_helper_role_id,
      allow: [PermissionFlagsBits.ViewChannel],
      type: OverwriteType.Role,
    })
  }

  const response = await pool.query(
    `
        INSERT INTO matches (queue_id)
        VALUES ($1)
        RETURNING id
    `,
    [queue.rows[0].id],
  )

  const matchId = response.rows[0].id
  const backupCat = '1427367817803464914'
  const category = await guild.channels.fetch(categoryId)
  if (!category || category.type !== ChannelType.GuildCategory) {
    return console.log('Not a valid category.')
  }
  const channelCount = category.children.cache.size

  const channel = await guild.channels.create({
    name: `match-${matchId}`,
    type: ChannelType.GuildText,
    parent: channelCount > 45 ? backupCat : categoryId,
    permissionOverwrites: permissionOverwrites,
  })

  await pool.query(
    `
        UPDATE matches 
        SET channel_id = $1
        WHERE id = $2
    `,
    [channel.id, matchId],
  )

  // Insert match_users (queue_join_time is already NULL from matchUpGames)
  for (const userId of userIds) {
    await pool.query(
      `INSERT INTO match_users (user_id, match_id, team)
       VALUES ($1, $2, $3)`,
      [userId, matchId, userIds.indexOf(userId) + 1],
    )

    const member = await guild.members.fetch(userId)
    try {
      await member.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('Match Found!')
            .setDescription(`**Match Channel**\n<#${channel.id}>`)
            .setColor(0x00ff00),
        ],
      })
    } catch (err) {}
  }

  await updateQueueMessage()

  // Wait 2 seconds for channel to fully propagate in Discord's API
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Send queue start messages
  await sendMatchInitMessages(queueId, matchId, channel)

  return channel
}

// Get the time spent in queue in a discord timestamp
export async function timeSpentInQueue(
  userId: string,
  queueId: number,
): Promise<string | null> {
  if (!(await userInQueue(userId))) return null

  const response = await pool.query(
    `SELECT queue_join_time FROM queue_users WHERE user_id = $1 AND queue_id = $2`,
    [userId, queueId],
  )

  if (response.rows.length === 0) return null

  const joinTime = new Date(response.rows[0].queue_join_time)
  const timeSpent = Math.floor(joinTime.getTime() / 1000) // Convert to seconds for Discord timestamp
  return `<t:${timeSpent}:R>`
}

// set queue roles
export async function setUserQueueRole(
  queueId: number,
  userId: string,
): Promise<void> {
  const currentRole = await getUserQueueRole(queueId, userId)
  const leaderboardRole = await getLeaderboardQueueRole(queueId, userId)
  const allQueueRoles = await getAllQueueRoles(queueId, false)

  const guild =
    client.guilds.cache.get(process.env.GUILD_ID!) ??
    (await client.guilds.fetch(process.env.GUILD_ID!))
  const member = await guild.members.fetch(userId)

  // Remove all MMR-based roles (where mmr_threshold is not null)
  const mmrRoles = allQueueRoles.filter((role) => role.mmr_threshold !== null)
  for (const role of mmrRoles) {
    await member.roles.remove(role.role_id)
  }

  // Add the current MMR-based role if one exists
  if (currentRole) {
    await member.roles.add(currentRole.role_id)
  }

  // Remove all leaderboard roles (where leaderboard_min is not null)
  const leaderboardRoles = allQueueRoles.filter(
    (role) => role.leaderboard_min !== null,
  )
  for (const role of leaderboardRoles) {
    await member.roles.remove(role.role_id)
  }

  // Add the current leaderboard role if one exists
  if (leaderboardRole) {
    await member.roles.add(leaderboardRole.role_id)
  }
}

// setup view stats buttons
export function setupViewStatsButtons(
  queueName: string,
): ActionRowBuilder<ButtonBuilder> {
  const viewStatsBtn = new ButtonBuilder()
    .setCustomId(`view-stats-${queueName}`)
    .setLabel('Show My Stats')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔎')

  const leaderboardBtn = new ButtonBuilder()
    .setLabel('Leaderboard')
    .setStyle(ButtonStyle.Link)
    .setEmoji('📊')
    .setURL('https://balatromp.com/leaderboards')

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    viewStatsBtn,
    leaderboardBtn,
  )
}

// TODO: ADD
export async function sendQueueLog(
  queueId: number,
  matchId: number,
): Promise<void> {}

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
  OverwriteType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from 'discord.js'
import {
  getTeamsInMatch,
  sendMatchInitMessages,
  sendWebhook,
} from './matchHelpers'
import {
  createQueueUser,
  getAllQueueRoles,
  getLeaderboardQueueRole,
  getQueueSettings,
  getSettings,
  getUserDmsEnabled,
  getUserQueueRole,
  getUsersInQueue,
  setMatchQueueLogMessageId,
  userInMatch,
  userInQueue,
} from './queryDB'
import { Queues } from 'psqlDB'
import { QueryResult } from 'pg'
import { client, getGuild } from '../client'
import { checkBans } from './automaticUnbans'

let lastMatchCreationTime = 0

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
          try {
            queueMsg = await msg.edit({
              embeds: [embed],
              components: [selectRow, buttonRow],
            })
          } catch (err) {
            console.error('Failed to edit queue message:', err)
          }
        } else {
          try {
            await msg.delete()
          } catch (err) {
            console.error('Failed to delete old queue message:', err)
          }
        }
      })
      .catch((err) => {
        console.error('Failed to fetch queue message:', err)
      })
  }

  if (!queueMsg) {
    try {
      queueMsg = await queueChannel.send({
        embeds: [embed],
        components: [selectRow, buttonRow],
      })
      await pool.query('UPDATE settings SET queue_message_id = $1', [
        queueMsg.id,
      ])
    } catch (err) {
      console.error('Failed to send queue message:', err)
    }
  }

  return queueMsg
}

export async function joinQueues(
  interaction: StringSelectMenuInteraction | CommandInteraction,
  selectedQueueIds: string[],
  userId: string,
): Promise<string[] | null> {
  // Get guild member for role checks
  const guild = await getGuild()
  const member = await guild.members.fetch(userId)

  // Ensure user exists
  await pool.query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [userId],
  )

  // Check if user is in a match
  const inMatch = await userInMatch(userId)
  if (inMatch) {
    const matchId = await pool.query(
      `SELECT match_id FROM match_users WHERE user_id = $1`,
      [userId],
    )
    const matchData = await pool.query(`SELECT * FROM matches WHERE id = $1`, [
      matchId.rows[matchId.rows.length - 1].match_id,
    ])

    console.log(
      matchData.rows[0].channel_id,
      matchData.rows[0].open,
      matchData.rows.length,
    )
    await interaction.editReply({
      content: `You're already in a match! <#${matchData.rows[0].channel_id}>`,
    })
    return null
  }

  const queueIds = selectedQueueIds.map((id) => parseInt(id))

  // Check if user is already in any of the selected queues
  const alreadyInQueueCheck = await pool.query(
    `
    SELECT queue_id FROM queue_users
    WHERE user_id = $1
      AND queue_id = ANY($2::int[])
      AND queue_join_time IS NOT NULL
  `,
    [userId, queueIds],
  )

  if (alreadyInQueueCheck.rows.length > 0) {
    const queueIdsAlreadyIn = alreadyInQueueCheck.rows.map((r) => r.queue_id)
    const queueNames = await pool.query(
      `SELECT queue_name FROM queues WHERE id = ANY($1::int[])`,
      [queueIdsAlreadyIn],
    )
    const names = queueNames.rows.map((r) => r.queue_name).join(', ')

    await interaction
      ?.editReply({
        content: `You're already in queue: ${names}`,
      })
      .catch((e) => console.error(e))
    return null
  }

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
      await interaction.editReply({
        content: `You need the **${roleName}** role to join the ${queue.queue_name} queue.`,
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
             peak_elo = COALESCE(peak_elo, $3),
             current_elo_range = $4
         WHERE user_id = $1 AND queue_id = $2`,
        [userId, queueId, queue.default_elo, queue.elo_search_start],
      )
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
  } finally {
    client.release()
  }

  // Send webhook notification for each queue joined
  // For now just send the first one they joined, add multi-queue support later
  const queueId = parseInt(selectedQueueIds[0])
  sendWebhook('JOIN_QUEUE', {
    new_players: [{ id: userId }],
    queueId,
  })

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

      // Rate limit match creation to once every 5 seconds
      if (Date.now() - lastMatchCreationTime < 5000) continue

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

        lastMatchCreationTime = Date.now()

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
  // putting this here for now todo: replace with api cronjob
  await checkBans()

  if (userIds.length === 0 || !queueId) {
    console.error('Wrong parameters provided for creating a match')
  }

  // get global settings
  const queue: QueryResult<Queues> = await pool.query(
    'SELECT id, queue_name FROM queues WHERE id = $1',
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
    name: `${queue.rows[0].queue_name.toLowerCase()}-${matchId}`,
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
  }

  await updateQueueMessage()

  // Wait 2 seconds for channel to fully propagate in Discord's API
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Send queue start messages
  await sendMatchInitMessages(queueId, matchId, channel)

  for (const userId of userIds) {
    if (!(await getUserDmsEnabled(userId))) continue
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

  // Send webhook notification for match started
  sendWebhook('MATCH_STARTED', {
    players: userIds.map((id) => ({ id })),
    matchId,
    queueId,
  })

  // Log match creation
  await sendQueueLog(matchId, queueId, userIds)

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

const leaderboardUpdateLocks = new Set<number>()
const leaderboardUpdatePending = new Set<number>()

export async function updateAllLeaderboardRoles(
  queueId: number,
): Promise<void> {
  if (leaderboardUpdateLocks.has(queueId)) {
    leaderboardUpdatePending.add(queueId)
    return
  }

  leaderboardUpdateLocks.add(queueId)

  try {
    const roles = await pool.query(
      `SELECT * FROM queue_roles
       WHERE queue_id = $1 AND leaderboard_min IS NOT NULL
       ORDER BY leaderboard_min`,
      [queueId],
    )

    if (roles.rowCount === 0) return

    const maxPos = Math.max(...roles.rows.map((r) => r.leaderboard_max))
    const users = await pool.query(
      `SELECT user_id FROM (
         SELECT user_id, ROW_NUMBER() OVER (ORDER BY elo DESC) as rank
         FROM queue_users WHERE queue_id = $1
       ) ranked WHERE rank <= $2`,
      [queueId, maxPos + 10],
    )

    if (users.rowCount === 0) return

    const guild = await getGuild()
    const roleIds = roles.rows.map((r) => r.role_id)

    for (let i = 0; i < users.rows.length; i += 5) {
      await Promise.all(
        users.rows.slice(i, i + 5).map(async ({ user_id }) => {
          try {
            const expected = await getLeaderboardQueueRole(queueId, user_id)
            const member = await guild.members.fetch({
              user: user_id,
              force: true,
            })
            const current = member.roles.cache.filter((r) =>
              roleIds.includes(r.id),
            )

            const needsUpdate =
              (expected && !current.has(expected.role_id)) ||
              (current.size > 0 &&
                (!expected || !current.has(expected.role_id)))

            if (needsUpdate) await setUserQueueRole(queueId, user_id)
          } catch (err) {
            console.error(`Failed to update roles for ${user_id}:`, err)
          }
        }),
      )

      if (i + 5 < users.rows.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  } catch (err) {
    console.error(`Error updating leaderboard roles for queue ${queueId}:`, err)
  } finally {
    leaderboardUpdateLocks.delete(queueId)

    if (leaderboardUpdatePending.has(queueId)) {
      leaderboardUpdatePending.delete(queueId)
      updateAllLeaderboardRoles(queueId).catch((err) =>
        console.error(`Failed to re-run leaderboard update:`, err),
      )
    }
  }
}

// set queue roles
export async function setUserQueueRole(
  queueId: number,
  userId: string,
): Promise<void> {
  const currentRole = await getUserQueueRole(queueId, userId)
  const allQueueRoles = await getAllQueueRoles(queueId, false)
  const leaderboardRole = await getLeaderboardQueueRole(queueId, userId)

  const guild = await getGuild()
  const member = await guild.members.fetch({ user: userId, force: true })
  const currentRoleIds = member.roles.cache.map((role) => role.id)

  const mmrRoles = allQueueRoles.filter((role) => role.mmr_threshold !== null)
  const leaderboardRoles = allQueueRoles.filter(
    (role) => role.leaderboard_min !== null,
  )

  const rolesToRemove: string[] = []
  const rolesToAdd: string[] = []

  for (const role of leaderboardRoles) {
    const expectedRole =
      leaderboardRole && role.role_id === leaderboardRole.role_id

    if (expectedRole && !currentRoleIds.includes(role.role_id)) {
      rolesToAdd.push(role.role_id)
    } else if (!expectedRole && currentRoleIds.includes(role.role_id)) {
      rolesToRemove.push(role.role_id)
    }
  }

  for (const role of mmrRoles) {
    const expectedRole = currentRole && role.role_id === currentRole.role_id

    if (expectedRole && !currentRoleIds.includes(role.role_id)) {
      rolesToAdd.push(role.role_id)
    } else if (!expectedRole && currentRoleIds.includes(role.role_id)) {
      rolesToRemove.push(role.role_id)
    }
  }

  if (rolesToRemove.length === 0 && rolesToAdd.length === 0) {
    return
  }

  try {
    const currentRoles = Array.from(member.roles.cache.keys())

    const newRoles = currentRoles
      .filter((roleId) => !rolesToRemove.includes(roleId))
      .concat(rolesToAdd.filter((roleId) => !currentRoles.includes(roleId)))

    await member.roles.set(newRoles)
  } catch (err) {
    console.error(`Failed to update roles for user ${userId}:`, err)
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

// Logs match creation with buttons to retroactively change the winner
export async function sendQueueLog(
  matchId: number,
  queueId: number,
  userIds: string[],
): Promise<void> {
  const { CommandFactory } = await import('./logCommandUse')

  // Get queue details
  const queueSettings = await getQueueSettings(queueId)
  if (!queueSettings) return

  const queueName = queueSettings.queue_name

  const matchLog = CommandFactory.build('match_created')
  if (!matchLog) return

  matchLog.setBlame('System')

  const fields = [
    {
      name: 'Match ID',
      value: `#${matchId}`,
      inline: true,
    },
    {
      name: 'Queue',
      value: queueName,
      inline: true,
    },
    {
      name: 'Players',
      value: userIds.map((id) => `<@${id}>`).join('\n'),
      inline: false,
    },
  ]

  matchLog.setFields(fields)
  matchLog.createEmbed()
  matchLog.addFields()

  // Add select menu for changing winner
  const membersPerTeam = queueSettings.members_per_team
  const options: StringSelectMenuOptionBuilder[] = []

  // Get team assignments using teamResults
  const teamResults = await getTeamsInMatch(matchId)

  // Build select menu options
  for (const team of teamResults.teams) {
    let label = `Team ${team.id}`
    let description = `Set Team ${team.id} as the winner`

    // If team size is 1, use player name instead
    if (membersPerTeam === 1 && team.players.length > 0) {
      try {
        const guild = await getGuild()
        const member = await guild.members.fetch(team.players[0].user_id)
        label = member.displayName
        description = `Set ${member.displayName} as the winner`
      } catch (err) {
        // If fetching fails, fall back to Team X
        console.error('Failed to fetch member for team label:', err)
      }
    }

    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setDescription(description)
        .setValue(`${team.id}`),
    )
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`change-match-winner-${matchId}`)
    .setPlaceholder('Change Match Winner')
    .addOptions(options)

  const selectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)

  // Add cancel match button
  const cancelButton = new ButtonBuilder()
    .setCustomId(`cancel-${matchId}`)
    .setLabel('Cancel Match')
    .setStyle(ButtonStyle.Danger)

  const transcriptBtn = new ButtonBuilder()
    .setLabel('View Transcripts')
    .setStyle(ButtonStyle.Link)
    .setURL(`https://balatromp.com/transcript/${matchId}`)
    .setDisabled(true)

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    cancelButton,
    transcriptBtn,
  )

  // Send to logging channel
  try {
    await matchLog.setLogChannel()
    if (matchLog.channel) {
      const matchLogMsg = await matchLog.channel.send({
        embeds: [matchLog.embed],
        components: [selectRow, buttonRow],
      })
      await setMatchQueueLogMessageId(matchId, matchLogMsg.id)
    }
  } catch (err) {
    console.error('Failed to send queue log:', err)
    // Continue execution even if logging fails - don't block match creation
  }
}

import { Channel, TextChannel } from 'discord.js'
import { pool } from '../db'
import { create } from 'node:domain'
import { remove, update } from 'lodash-es'
import { MatchUsers, teamResults, Matches, Queues, Settings } from 'psqlDB'

// Get the queue names of all queues that exist
export async function getQueueNames(): Promise<string[]> {
  const res = await pool.query('SELECT queue_name FROM queues')
  return res.rows.map((row) => row.queue_name)
}

export async function getQueueIdFromName(queueName: string): Promise<string> {
  const res = await pool.query(
    `
    SELECT id FROM queues WHERE queue_name = $1
    `,
    [queueName],
  )

  return res.rows[0].id
}

// Get all queues that are not locked
export async function getActiveQueues(): Promise<Queues[]> {
  const res = await pool.query('SELECT * FROM queues WHERE locked = false')
  return res.rows
}

// Get all queues that a user is in
export async function getUserQueues(userId: string): Promise<Queues[]> {
  const res = await pool.query(
    `
    SELECT q.*
    FROM queues q
    JOIN queue_users uq ON uq.queue_id = q.id
    WHERE uq.user_id = $1 AND uq.queue_join_time IS NOT NULL
  `,
    [userId],
  )

  return res.rows
}

// Set a priority queue for a user
export async function setUserPriorityQueue(
  userId: string,
  queueId: number | null,
): Promise<boolean> {
  const response = await pool.query(
    `
    UPDATE users
    SET priority_queue_id = $2
    WHERE user_id = $1
    RETURNING *
  `,
    [userId, queueId],
  )

  if (response.rows.length < 1) {
    await pool.query(
      `INSERT INTO users (user_id, priority_queue_id)
        VALUES ($1, $2)`,
      [userId, queueId],
    )
  }

  if (response.rowCount === 0) {
    return false
  }
  return true
}

// get the queue id that the user has set as their priority queue
export async function getUserPriorityQueueId(
  userId: string,
): Promise<number | null> {
  const res = await pool.query(
    `
    SELECT priority_queue_id 
    FROM users
    WHERE user_id = $1
  `,
    [userId],
  )

  return res.rows[0].priority_queue_id
}

//  get the match id from the match channel id
export async function getMatchIdFromChannel(
  channelId: string,
): Promise<number | null> {
  const res = await pool.query(
    `
    SELECT id FROM matches WHERE channel_id = $1 AND open = true
  `,
    [channelId],
  )
  if (res.rowCount === 0) return null
  return res.rows[0].id
}

// Get the match text channel
export async function getMatchChannel(
  matchId: number,
): Promise<TextChannel | null> {
  const { rows, rowCount } = await pool.query(
    `
    SELECT channel_id FROM matches
    WHERE id = $1
    `,
    [matchId],
  )

  if (rowCount == 0) throw Error('No matches found under this ID.')

  const client = (await import('../index')).default
  const channel = await client.channels.fetch(rows[0].channel_id)

  if (channel instanceof TextChannel) {
    return channel
  }

  throw new Error(`Channel is not a TextChannel for match ID ${matchId}`)
}

// Get the results channel for a match
export async function getMatchResultsChannel(): Promise<TextChannel | null> {
  const { rows, rowCount } = await pool.query(
    `SELECT queue_results_channel_id FROM settings`,
  )

  if (rowCount == 0) {
    throw new Error(`No queue found.`)
  }

  const client = (await import('../index')).default
  const channel = await client.channels.fetch(rows[0].queue_results_channel_id)

  if (channel instanceof TextChannel) {
    return channel
  }

  throw new Error(`Channel is not a TextChannel.`)
}

// Get users in a specified queue
export async function getUsersInQueue(queueId: number): Promise<string[]> {
  const response = await pool.query(
    `
    SELECT u.user_id 
    FROM queue_users u
    JOIN queues q ON u.queue_id = q.id
    WHERE u.queue_join_time IS NOT NULL
      AND q.id = $1
    `,
    [queueId],
  )

  return response.rows.map((row) => row.user_id)
}

// Remove user from queue
export async function removeUserFromQueue(
  queueId: number,
  userId: string,
): Promise<boolean> {
  // Update the user's queue status and join with the queues table based on channel id
  const response = await pool.query(
    `
    UPDATE queue_users
    SET queue_join_time = NULL
    WHERE user_id = $1 AND queue_id = $2
  `,
    [userId, queueId],
  )

  if (response.rowCount === 0) {
    return false
  }
  return true
}

// Checks if a user is in a match
export async function userInMatch(userId: string): Promise<boolean> {
  // gets all open matches
  const openMatches = await pool.query(`
    SELECT * FROM matches
    WHERE open = true
  `)

  // checks for the requested userId (not optimised but im stupid) - casjb
  let response: any[] = []
  for (const match of openMatches.rows) {
    const result = await pool.query(
      `
      SELECT * FROM match_users
      WHERE user_id = $1 AND match_id = $2
      `,
      [userId, match.id],
    )
    response = response.concat(result.rows)
  }

  return response.length > 0
}

export async function closeMatch(matchId: number): Promise<boolean> {
  const res = await pool.query(
    `UPDATE matches SET open = false WHERE id = $1`,
    [matchId],
  )
  if (res.rowCount === 0) {
    return false
  }
  return true
}

// -- Party Functions --
export const partyUtils = {
  getPartyUserList,
  getUserParty,
  addUserToParty,
  createParty,
  removeUserFromParty,
  deleteParty,
  isLeader,
  getPartyName,
  listAllParties, // admin only
}

// lists all parties (admin only)
export async function listAllParties(): Promise<any[]> {
  const response = await pool.query(`SELECT * FROM parties`)
  return response.rows
}

// gets the name of a party by its ID
export async function getPartyName(partyId: string): Promise<string | null> {
  const response = await pool.query(`SELECT name FROM parties WHERE id = $1`, [
    partyId,
  ])
  if (response.rowCount === 0) return null
  return response.rows[0].name
}

// checks if a user is the leader of their party
export async function isLeader(userId: string): Promise<boolean> {
  const userPartyId = await getUserParty(userId)
  if (!userPartyId) return false
  const response = await pool.query(
    `SELECT is_leader FROM party_users WHERE user_id = $1 AND party_id = $2`,
    [userId, userPartyId],
  )
  if (response.rowCount === 0) return false
  return response.rows[0].is_leader
}

// Returns the user list of a given party (id or id with names)
export async function getPartyUserList(
  partyId: string,
  includeNames: boolean = false,
): Promise<any[] | null> {
  const response = await pool.query(
    `SELECT user_id FROM users WHERE joined_party_id = $1`,
    [partyId],
  )
  if (!includeNames) {
    return response.rows.map((row) => row.user_id)
  }
  return Promise.all(
    response.rows.map(async (row) => {
      const client = (await import('../index')).default
      const user = await client.users.fetch(row.user_id)
      return { name: user.username, id: row.user_id }
    }),
  )
}

// returns the current party that the given user is in
export async function getUserParty(userId: string): Promise<string | null> {
  const response = await pool.query(
    `SELECT joined_party_id FROM users WHERE user_id = $1`,
    [userId],
  )
  return response.rows.map((row) => row.joined_party_id)[0] || null
}

// adds user to a party
export async function addUserToParty(
  userId: string,
  partyId: string,
  isLeader: boolean = false,
): Promise<void> {
  // ensure user exists in users table
  await pool.query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId],
  )
  await pool.query(`UPDATE users SET joined_party_id = $1 WHERE user_id = $2`, [
    partyId,
    userId,
  ])
  await pool.query(
    `INSERT INTO party_users (party_id, user_id, is_leader) VALUES ($1, $2, $3)`,
    [partyId, userId, isLeader],
  )
}

// creates a party based on provided parameters
export async function createParty(
  partyName: string,
  partyCreatorId?: string,
): Promise<string> {
  const partyCreatedAt = new Date()
  const response = await pool.query(
    `INSERT INTO parties (created_at, name) VALUES ($1, $2) RETURNING id`,
    [partyCreatedAt, partyName],
  )
  if (partyCreatorId) {
    await addUserToParty(partyCreatorId, response.rows[0].id, true)
  }
  return response.rows[0].id
}

// removes a user from their party (including by leaving the party themselves)
export async function removeUserFromParty(userId: string): Promise<void> {
  const partyId = await getUserParty(userId)
  if (!partyId) return

  await pool.query(
    `UPDATE users SET joined_party_id = NULL WHERE user_id = $1`,
    [userId],
  )
  await pool.query(
    `DELETE FROM party_users WHERE user_id = $1 AND party_id = $2`,
    [userId, partyId],
  )

  // check if party is empty, if so delete it
  const partyMembersCount = await getPartyUserList(partyId)
  if (partyMembersCount && partyMembersCount.length === 0) {
    deleteParty(partyId)
  }
}

// delete a party by its ID
export async function deleteParty(partyId: string): Promise<void> {
  await pool.query(`DELETE FROM parties WHERE id = $1`, [partyId])
  await pool.query(
    `UPDATE users SET joined_party_id = NULL WHERE joined_party_id = $1`,
    [partyId],
  )
  await pool.query(`DELETE FROM party_users WHERE party_id = $1`, [partyId])
}

// Checks if a user is currently in a queue
export async function userInQueue(userId: string): Promise<boolean> {
  const response = await pool.query(
    `
        SELECT * FROM queue_users
        WHERE user_id = $1 AND queue_join_time IS NOT NULL
        `,
    [userId],
  )

  return response.rows.length > 0
}

// gets all settings for a specific queue
export async function getQueueSettings(
  queueId: number,
  fields: (keyof Queues)[] = [],
): Promise<Queues> {
  const selectFields = fields.length > 0 ? fields.join(', ') : '*'
  const response = await pool.query(
    `
    SELECT ${selectFields} FROM queues WHERE id = $1
  `,
    [queueId],
  )

  if (response.rowCount === 0) {
    throw new Error(`Queue with id ${queueId} does not exist.`)
  }

  return response.rows[0]
}

// gets data from a match
export async function getMatchData(matchId: number): Promise<Matches> {
  const response = await pool.query(
    `
    SELECT * FROM matches WHERE id = $1
  `,
    [matchId],
  )
  if (response.rowCount === 0) {
    throw new Error(`Match with ID ${matchId} does not exist.`)
  }

  return response.rows[0]
}

// gets player data for a live match to calculate Glicko-2 or openSkill ratings
export async function getPlayerDataLive(matchId: number) {
  // get user_id for every player in the match
  const matchUsers = await pool.query(
    `
    SELECT user_id FROM match_users
    WHERE match_id = $1`,
    [matchId],
  )

  let playerList: any[] = []
  try {
    // repeat for each player in the match
    for (const matchUser of matchUsers.rows) {
      // get the player's data for calculations
      const playerData = await pool.query(
        `
        SELECT elo, win_streak, volatility FROM queue_users WHERE user_id = $1`,
        [matchUser.user_id],
      )
      if (playerData.rows.length > 0) {
        playerList.push({ [matchUser.user_id]: playerData.rows[0] })
      }
    }
  } catch (err) {
    throw new Error(`Failed to fetch player data for match ID ${matchId}`)
  }

  return { playerList }
}

// todo: write these:
// -- Rating Functions --
export const ratingUtils = {
  updatePlayerVolatility,
  updatePlayerDeviation,
  resetPlayerElo,
  getPlayerElo,
  getPlayerVolatility,
  getPlayerDeviation,
  updatePlayerGlickoAll,
}

// updates all of a player's glicko values at once
export async function updatePlayerGlickoAll(
  queueId: number,
  userId: string,
  newElo: number,
  newDeviation: number,
  newVolatility: number,
): Promise<void> {
  await pool.query(
    `UPDATE queue_users SET elo = $1, rating_deviation = $2, volatility = $3 WHERE user_id = $4 AND queue_id = $5`,
    [newElo, newDeviation, newVolatility, userId, queueId],
  )
}

export async function updatePlayerElo(
  queueId: number,
  userId: string,
  newElo: number,
): Promise<void> {
  const res = await pool.query(
    `UPDATE queue_users SET elo = $1 WHERE user_id = $2 AND queue_id = $3 RETURNING id`,
    [Math.round(newElo), userId, queueId],
  )
}

// updates a player's volatility
export async function updatePlayerVolatility(
  userId: string,
  newVolatility: number,
): Promise<void> {
  await pool.query(
    `UPDATE queue_users SET volatility = $1 WHERE user_id = $2`,
    [newVolatility, userId],
  )
}

// updates a player's rating deviation
export async function updatePlayerDeviation(
  userId: string,
  newDeviation: number,
): Promise<void> {
  await pool.query(
    `UPDATE queue_users SET rating_deviation = $1 WHERE user_id = $2`,
    [Math.round(newDeviation), userId],
  )
}

// resets a player's ELO to default
export async function resetPlayerElo(userId: string): Promise<void> {
  const defaultEloRes = await pool.query(
    `SELECT default_elo FROM queues WHERE id = (SELECT queue_id FROM queue_users WHERE user_id = $1)`,
    [userId],
  )
  if (defaultEloRes.rowCount === 0) throw new Error('No default elo founf.')
  const defaultElo = defaultEloRes.rows[0].default_elo
  await pool.query(`UPDATE queue_users SET elo = $1 WHERE user_id = $2`, [
    defaultElo,
    userId,
  ])
}

// gets a player's current ELO
export async function getPlayerElo(
  userId: string,
  queueId: number,
): Promise<number | null> {
  const response = await pool.query(
    `SELECT elo FROM queue_users WHERE user_id = $1 AND queue_id = $2`,
    [userId, queueId],
  )
  if (response.rowCount === 0) return null
  return response.rows[0].elo
}

// gets a player's current volatility
export async function getPlayerVolatility(
  userId: string,
): Promise<number | null> {
  return null
}

// gets a player's current rating deviation
export async function getPlayerDeviation(
  userId: string,
): Promise<number | null> {
  return null
}

// return whether a queue is glicko or openskill
export async function isQueueGlicko(queueId: string): Promise<boolean> {
  const response = await pool.query(
    `SELECT members_per_team, number_of_teams FROM queues WHERE id = $1`,
    [queueId],
  )
  if (response.rowCount === 0)
    throw new Error(`Queue with id ${queueId} does not exist.`)
  let isGlicko: boolean
  if (
    response.rows[0].number_of_teams === 2 &&
    response.rows[0].members_per_team === 1
  ) {
    isGlicko = true
  } else {
    isGlicko = false
  }
  return isGlicko
}

// get queue ID from match ID
export async function getQueueIdFromMatch(matchId: number): Promise<string> {
  const response = await pool.query(
    `SELECT queue_id FROM matches WHERE id = $1`,
    [matchId],
  )
  if (response.rowCount === 0)
    throw new Error(`Match with id ${matchId} does not exist.`)
  return response.rows[0].queue_id
}

// get winning team from match ID
export async function getWinningTeamFromMatch(
  matchId: number,
): Promise<number | null> {
  const response = await pool.query(
    `SELECT winning_team FROM matches WHERE id = $1`,
    [matchId],
  )
  if (response.rowCount === 0)
    throw new Error(`Match with id ${matchId} does not exist.`)
  return response.rows[0].winning_team
}

// update teamResults object with latest data
export async function updateTeamResults(
  queueId: number,
  teamResults: teamResults,
  fields: (keyof MatchUsers)[],
): Promise<teamResults> {
  const userIds = teamResults.teams.flatMap((team) =>
    team.players.map((player) => player.user_id),
  )
  const matchId = teamResults.teams[0].players[0].match_id
  if (!matchId) throw new Error('Players do not have a match_id.')

  const winningTeam = await getWinningTeamFromMatch(matchId)

  // Build the SELECT clause dynamically
  const selectFields = fields.length > 0 ? fields.join(', ') : '*'
  const latestUsers = await pool.query(
    `SELECT user_id, ${selectFields} FROM queue_users WHERE user_id = ANY($1) AND queue_id = $2`,
    [userIds, queueId],
  )

  const latestUserMap = new Map(
    latestUsers.rows.map((user) => [user.user_id, user]),
  )

  for (const team of teamResults.teams) {
    if (team.id === winningTeam) {
      team.score = 1
    } else {
      team.score = 0
    }
    for (const player of team.players) {
      const latest = latestUserMap.get(player.user_id)
      if (latest) {
        for (const field of fields) {
          ;(player as any)[field] = latest[field]
        }
      }
    }
  }

  return teamResults
}

// IMPORTANT: you must already have checked that they are in the queue
// get the current elo range for a user in a specific queue
export async function getCurrentEloRangeForUser(
  userId: string,
  queueId: number,
): Promise<number> {
  const response = await pool.query(
    `SELECT current_elo_range FROM queue_users WHERE user_id = $1 AND queue_id = $2`,
    [userId, queueId],
  )

  return response.rows[0].current_elo_range || 0
}

// update the current elo range for a user in a specific queue
export async function updateCurrentEloRangeForUser(
  userId: string,
  queueId: number,
  newRange: number,
): Promise<void> {
  await pool.query(
    `UPDATE queue_users SET current_elo_range = $1 WHERE user_id = $2 AND queue_id = $3`,
    [newRange, userId, queueId],
  )
}

// get the users in a specific match
export async function getUsersInMatch(matchId: number): Promise<string[]> {
  const response = await pool.query(
    `SELECT user_id FROM match_users WHERE match_id = $1`,
    [matchId],
  )
  return response.rows.map((row) => row.user_id)
}

// get the team of a user in a specific match
export async function getUserTeam(
  userId: string,
  matchId: number,
): Promise<number | null> {
  const response = await pool.query(
    `SELECT team FROM match_users mu 
    JOIN users u ON mu.user_id = u.user_id
    WHERE u.user_id = $1 AND mu.match_id = $2`,
    [userId, matchId],
  )
  if (response.rowCount === 0) return null
  return response.rows[0].team
}

// get the contents of the settings table
export async function getSettings(): Promise<Settings> {
  const response = await pool.query(`SELECT * FROM settings`)
  if (response.rowCount === 0) throw new Error('No settings found.')
  return response.rows[0]
}

import { TextChannel, VoiceChannel } from 'discord.js'
import { pool } from '../db'
import type { Strikes } from 'psqlDB'
import {
  Decks,
  Matches,
  QueueRoles,
  Queues,
  Settings,
  Stakes,
  StatsCanvasPlayerData,
  teamResults,
} from 'psqlDB'
import { client } from '../client'
import { QueryResult } from 'pg'
import { setUserQueueRole } from './queueHelpers'
import { endMatch } from './matchHelpers'

// Get the helper role
export async function getHelperRoleId(): Promise<string | null> {
  const res = await pool.query('SELECT helper_role_id FROM settings')
  return res.rows[0].helper_role_id
}

// Lock/unlock a queue
export async function queueChangeLock(queueId: number, lock: boolean = true) {
  const res = await pool.query(
    `UPDATE queues SET locked = $2 WHERE id = $1 RETURNING id`,
    [queueId, lock],
  )

  return res.rowCount !== 0
}

// Get the role lock for a queue
export async function getQueueRoleLock(queueId: number): Promise<string | null> {
  const res = await pool.query(
    `SELECT role_lock_id FROM queues WHERE id = $1`,
    [queueId],
  )

  if (res.rowCount === 0) return null
  return res.rows[0].role_lock_id
}

// Set the role lock for a queue
export async function setQueueRoleLock(
  queueId: number,
  roleId: string | null,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE queues SET role_lock_id = $2 WHERE id = $1 RETURNING id`,
    [queueId, roleId],
  )

  return res.rowCount !== 0
}

// Get the queue names of all queues that exist
export async function getQueueNames(): Promise<string[]> {
  const res = await pool.query('SELECT queue_name FROM queues')
  return res.rows.map((row) => row.queue_name)
}

export async function getQueueIdFromName(queueName: string): Promise<number> {
  const res = await pool.query(
    `
    SELECT id FROM queues WHERE queue_name = $1
    `,
    [queueName],
  )

  return parseInt(res.rows[0].id)
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

// Create a queue user (or do nothing if one exists)
export async function createQueueUser(
  userId: string,
  queueId: number,
): Promise<void> {
  const queueSettings = await getQueueSettings(queueId)

  await pool.query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId],
  )

  await pool.query(
    `
    INSERT INTO queue_users (user_id, elo, peak_elo, queue_id, queue_join_time)
    VALUES ($1, $2::real, $2::real, $3, NOW())
    ON CONFLICT (user_id, queue_id) DO NOTHING`,
    [userId, queueSettings.default_elo, queueId],
  )
  await setUserQueueRole(queueId, userId)
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

  return response.rowCount !== 0
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

  return res.rows[0].priority_queue_id ?? null
}

// create a queue role
export async function createQueueRole(
  queueId: number,
  roleId: string,
  mmrThreshold: number,
): Promise<boolean> {
  const res = await pool.query(
    `
    INSERT INTO queue_roles (queue_id, role_id, mmr_threshold)
    VALUES ($1, $2, $3)
    RETURNING queue_id
  `,
    [queueId, roleId, mmrThreshold],
  )

  return res.rowCount != 0
}

// create a leaderboard role
export async function createLeaderboardRole(
  queueId: number,
  roleId: string,
  leaderboardMin: number,
  leaderboardMax: number,
): Promise<boolean> {
  const res = await pool.query(
    `
    INSERT INTO queue_roles (queue_id, role_id, leaderboard_min, leaderboard_max)
    VALUES ($1, $2, $3, $4)
    RETURNING queue_id
  `,
    [queueId, roleId, leaderboardMin, leaderboardMax],
  )

  return res.rowCount != 0
}

// delete a queue role
export async function deleteQueueRole(
  queueId: number,
  roleId: string,
): Promise<void> {
  await pool.query(
    `
    DELETE FROM queue_roles
    WHERE queue_id = $1 AND role_id = $2;
  `,
    [queueId, roleId],
  )
}

export async function getAllQueueRoles(
  queueId: number,
  leaderboardOnly: boolean = false,
): Promise<QueueRoles[]> {
  let res
  if (leaderboardOnly) {
    res = await pool.query(
      `
      SELECT * FROM queue_roles
      WHERE queue_id = $1 AND leaderboard_min IS NOT NULL
    `,
      [queueId],
    )
  } else {
    res = await pool.query(
      `
      SELECT * FROM queue_roles
      WHERE queue_id = $1
    `,
      [queueId],
    )
  }

  return res.rows
}

// get a users highest queue role
export async function getUserQueueRole(
  queueId: number,
  userId: string,
): Promise<QueueRoles | null> {
  const userElo = await getPlayerElo(userId, queueId)

  const res = await pool.query(
    `
    SELECT *
    FROM queue_roles
    WHERE queue_id = $1 AND mmr_threshold <= $2
    ORDER BY mmr_threshold DESC
    LIMIT 1
  `,
    [queueId, userElo],
  )

  if (res.rowCount === 0) return null

  return res.rows[0]
}

export async function getLeaderboardPosition(
  queueId: number,
  userId: string,
): Promise<number | null> {
  const playersRes = await pool.query(
    `
    SELECT user_id
    FROM queue_users
    WHERE queue_id = $1
    ORDER BY elo DESC
    `,
    [queueId],
  )

  if (playersRes.rowCount === 0) return null

  const players: { user_id: string }[] = playersRes.rows
  return players.findIndex((p) => p.user_id === userId) + 1
}

export async function getLeaderboardQueueRole(
  queueId: number,
  userId: string,
): Promise<QueueRoles | null> {
  const rank = await getLeaderboardPosition(queueId, userId)

  const roleRes = await pool.query(
    `
    SELECT *
    FROM queue_roles
    WHERE queue_id = $1
      AND leaderboard_min >= $2
      AND leaderboard_max <= $2
    LIMIT 1
    `,
    [queueId, rank],
  )

  if (roleRes.rowCount === 0) return null
  return roleRes.rows[0]
}

export async function getUserPreviousQueueRole(
  queueId: number,
  userId: string,
): Promise<QueueRoles | null> {
  const userElo = await getPlayerElo(userId, queueId)

  const res = await pool.query(
    `
    SELECT *
    FROM queue_roles
    WHERE queue_id = $1 AND mmr_threshold < $2
    ORDER BY mmr_threshold DESC
    LIMIT 1
  `,
    [queueId, userElo],
  )

  if (res.rowCount === 0) return null

  return res.rows[0]
}

// Get all decks
export async function getDeckList(custom: boolean = true): Promise<Decks[]> {
  const res: QueryResult<Decks> = await pool.query(`SELECT * FROM decks`)

  let deckList = res.rows
  if (!custom) deckList = deckList.filter((deck) => !deck.custom)

  return deckList
}

// Get all stakes
export async function getStakeList(custom: boolean = true): Promise<Stakes[]> {
  const res: QueryResult<Stakes> = await pool.query(`SELECT * FROM stakes`)

  let stakeList = res.rows
  if (!custom) stakeList = stakeList.filter((stake) => !stake.custom)

  return stakeList
}

export async function getStake(stakeId: number): Promise<Stakes | null> {
  const res: QueryResult<Stakes> = await pool.query(
    `SELECT * FROM stakes WHERE id = $1`,
    [stakeId],
  )

  if (res.rowCount == 0) return null
  return res.rows[0]
}

export async function getStakeByName(
  stakeName: string,
): Promise<Stakes | null> {
  const res: QueryResult<Stakes> = await pool.query(
    `SELECT * FROM stakes WHERE stake_name = $1`,
    [stakeName],
  )

  if (res.rowCount == 0) return null
  return res.rows[0]
}

// get all available decks in a queue
export async function getDecksInQueue(queueId: number): Promise<Decks[]> {
  const res = await pool.query<Decks>(
    `
      SELECT d.*
      FROM decks d
      LEFT JOIN banned_decks b
        ON d.id = b.deck_id AND b.queue_id = $1
      WHERE b.deck_id IS NULL;
    `,
    [queueId],
  )

  return res.rows
}

// get banned deck IDs for a queue
export async function getBannedDeckIds(queueId: number): Promise<number[]> {
  const res = await pool.query<{ deck_id: number }>(
    `
      SELECT deck_id
      FROM banned_decks
      WHERE queue_id = $1
    `,
    [queueId],
  )

  return res.rows.map((row) => row.deck_id)
}

// set queue deck bans
export async function setQueueDeckBans(
  queueId: number,
  deckList: string[],
): Promise<void> {
  await pool.query(
    `
    DELETE FROM banned_decks
    WHERE queue_id = $1;
  `,
    [queueId],
  )

  for (const deckId of deckList) {
    await pool.query(
      `
      INSERT INTO banned_decks (queue_id, deck_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING;
    `,
      [queueId, deckId],
    )
  }
}

// Set the picked deck in the match data
export async function setPickedMatchDeck(
  matchId: number,
  deckName: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE matches
    SET deck = $2
    WHERE id = $1
  `,
    [matchId, deckName],
  )
}

// Set the picked stake in the match data
export async function setPickedMatchStake(
  matchId: number,
  stakeName: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE matches
    SET stake = $2
    WHERE id = $1
  `,
    [matchId, stakeName],
  )
}

// get stake voting team id
export async function getMatchStakeVoteTeam(matchId: number): Promise<number> {
  const res = await pool.query(
    `
    SELECT stake_vote_team_id FROM matches WHERE id = $1
  `,
    [matchId],
  )

  return res.rows[0].stake_vote_team_id
}

export async function setMatchStakeVoteTeam(
  matchId: number,
  teamId: number,
): Promise<void> {
  await pool.query(
    `
    UPDATE matches SET stake_vote_team_id = $2 WHERE id = $1
  `,
    [matchId, teamId],
  )
}

export async function setWinningTeam(matchId: number, winningTeam: number) {
  await pool.query('UPDATE matches SET winning_team = $1 WHERE id = $2', [
    winningTeam,
    matchId,
  ])
}

// Set match win data
export async function setMatchWinData(
  interaction: any,
  matchId: number,
  winningTeam: number,
  teamResults: teamResults,
) {
  await pool.query(`UPDATE matches SET winning_team = $1 WHERE id = $2`, [
    winningTeam,
    matchId,
  ])

  // Update elo_change for each player based on teamResults
  for (const team of teamResults.teams) {
    for (const player of team.players) {
      if (player.elo_change !== undefined && player.elo_change !== null) {
        await pool.query(
          `UPDATE match_users SET elo_change = $1 WHERE match_id = $2 AND user_id = $3`,
          [player.elo_change, matchId, player.user_id],
        )
      }
    }
  }

  await endMatch(matchId)
  await interaction.update({
    content: 'The match has ended!',
    embeds: [],
    components: [],
  })
}

export async function setMatchBestOf(
  matchId: number,
  bestOf: 3 | 5,
): Promise<void> {
  const isBo3 = bestOf === 3
  const isBo5 = bestOf === 5
  await pool.query(
    `
    UPDATE matches
    SET best_of_3 = $2,
        best_of_5 = $3
    WHERE id = $1
  `,
    [matchId, isBo3, isBo5],
  )
}

// get the match id from the match channel id
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

  const channel = await client.channels.fetch(rows[0].queue_results_channel_id)

  if (channel instanceof TextChannel) {
    return channel
  }

  throw new Error(`Channel is not a TextChannel.`)
}

// Set the match voice channel in the db
export async function setMatchVoiceChannel(
  matchId: number,
  voiceChannelId: string,
): Promise<void> {
  await pool.query(`UPDATE matches SET match_vc_id = $1 WHERE id = $2`, [
    voiceChannelId,
    matchId,
  ])
}

// Get the match voice channel from the db
export async function getMatchVoiceChannel(
  matchId: number,
): Promise<VoiceChannel | null> {
  const res = await pool.query(
    `SELECT match_vc_id FROM matches WHERE id = $1`,
    [matchId],
  )

  if (res.rowCount == 0) {
    return null
  }

  if (res.rows[0].match_vc_id) {
    const channel = await client.channels.fetch(res.rows[0].match_vc_id)

    if (channel instanceof VoiceChannel) {
      return channel
    }
  }

  return null
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

  return response.rowCount !== 0
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

// Get all active/open matches
export async function getActiveMatches(): Promise<Matches[]> {
  const res = await pool.query<Matches>(
    `SELECT * FROM matches WHERE open = true ORDER BY id DESC`,
  )
  return res.rows
}

export async function closeMatch(matchId: number): Promise<boolean> {
  const res = await pool.query(
    `UPDATE matches SET open = false WHERE id = $1`,
    [matchId],
  )

  // Delete match voice channel, if any
  const matchVoiceChannel = await getMatchVoiceChannel(matchId)
  if (matchVoiceChannel) {
    await matchVoiceChannel.delete().catch(() => {})
  }

  return res.rowCount !== 0
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
    await deleteParty(partyId)
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

// gets player data for a live match to calculate ratings
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

// -- Rating Functions --
export const ratingUtils = {
  updatePlayerVolatility,
  resetPlayerElo,
  getPlayerElo,
  getPlayerVolatility,
  updatePlayerMmrAll,
  updatePlayerWinStreak,
}

// updates all of a player's MMR related values at once
export async function updatePlayerMmrAll(
  queueId: number,
  userId: string,
  newElo: number,
  newVolatility: number,
): Promise<void> {
  // Clamp elo between 0 and 9999
  const clampedElo = Math.max(0, Math.min(9999, newElo))

  await pool.query(
    `UPDATE queue_users SET elo = $1, peak_elo = GREATEST(peak_elo, $1), volatility = $2 WHERE user_id = $3 AND queue_id = $4`,
    [clampedElo, newVolatility, userId, queueId],
  )
}

export async function updatePlayerElo(
  queueId: number,
  userId: string,
  newElo: number,
): Promise<void> {
  // Clamp elo between 0 and 9999
  const clampedElo = Math.max(0, Math.min(9999, Math.round(newElo)))

  await pool.query(
    `UPDATE queue_users
    SET elo = $1,
        peak_elo = GREATEST(peak_elo, $1)
    WHERE user_id = $2 AND queue_id = $3
    RETURNING id
    `,
    [clampedElo, userId, queueId],
  )

  // add decay grace to user, seeming as they have just played a match (in theory)
  const res = await pool.query(`
    SELECT decay_grace FROM settings WHERE singleton = true
  `)
  const decay_grace = res.rows[0].decay_grace

  await pool.query(
    `
    UPDATE queue_users SET last_decay = clock_timestamp() + ($1::double precision * interval '1 hour') WHERE user_id = $2 AND queue_id = $3
  `,
    [decay_grace, userId, queueId],
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

// updates a player's win streak based on whether they won or lost
export async function updatePlayerWinStreak(
  userId: string,
  queueId: number,
  won: boolean,
): Promise<void> {
  if (won) {
    // Increment win streak and update peak if necessary
    await pool.query(
      `UPDATE queue_users
       SET win_streak = win_streak + 1,
           peak_win_streak = GREATEST(peak_win_streak, win_streak + 1)
       WHERE user_id = $1 AND queue_id = $2`,
      [userId, queueId],
    )
  } else {
    // If they lost, check current win_streak
    const currentStreak = await pool.query(
      `SELECT win_streak FROM queue_users WHERE user_id = $1 AND queue_id = $2`,
      [userId, queueId],
    )

    if (currentStreak.rowCount === 0) return

    const streak = currentStreak.rows[0].win_streak

    if (streak === 0) {
      // If win_streak is 0, decrement by 1 (loss streak)
      await pool.query(
        `UPDATE queue_users
         SET win_streak = -1
         WHERE user_id = $1 AND queue_id = $2`,
        [userId, queueId],
      )
    } else {
      // Reset to 0 if they had a positive win streak
      await pool.query(
        `UPDATE queue_users
         SET win_streak = 0
         WHERE user_id = $1 AND queue_id = $2`,
        [userId, queueId],
      )
    }
  }
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
  queueId: number,
): Promise<number | null> {
  const response = await pool.query(
    `SELECT volatility FROM queue_users WHERE user_id = $1 AND queue_id = $2`,
    [userId, queueId],
  )
  if (response.rowCount === 0) return null
  return response.rows[0].volatility
}

// get queue ID from match ID
export async function getQueueIdFromMatch(matchId: number): Promise<number> {
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

// get the data for the statistics canvas display
export async function getStatsCanvasUserData(
  userId: string,
  queueId: number,
): Promise<StatsCanvasPlayerData> {
  // 1) Core player stats for this queue
  const playerRes = await pool.query(
    `
    SELECT
      qu.user_id,
      qu.elo,
      qu.peak_elo,
      qu.win_streak,
      qu.peak_win_streak
    FROM queue_users qu
    WHERE qu.user_id = $1 AND qu.queue_id = $2
    `,
    [userId, queueId],
  )

  if (playerRes.rowCount === 0) {
    throw new Error(
      'No player data found for this user in the specified queue.',
    )
  }

  const p = playerRes.rows[0] as {
    user_id: string
    elo: number
    peak_elo: number
    win_streak: number
    peak_win_streak: number
  }

  // Calculate wins, losses, and games_played from match_users
  const statsRes = await pool.query(
    `
    SELECT
      COUNT(CASE WHEN m.winning_team = mu.team THEN 1 END)::integer as wins,
      COUNT(CASE WHEN m.winning_team IS NOT NULL AND m.winning_team != mu.team THEN 1 END)::integer as losses,
      COUNT(CASE WHEN m.winning_team IS NOT NULL THEN 1 END)::integer as games_played
    FROM match_users mu
    JOIN matches m ON m.id = mu.match_id
    WHERE mu.user_id = $1 AND m.queue_id = $2
    `,
    [userId, queueId],
  )

  const wins = statsRes.rows[0]?.wins || 0
  const losses = statsRes.rows[0]?.losses || 0
  const games_played = statsRes.rows[0]?.games_played || 0

  const previousRes = await pool.query(
    `
    SELECT
      mu.elo_change AS change,
      m.created_at   AS time
    FROM match_users mu
    JOIN matches m ON m.id = mu.match_id
    WHERE mu.user_id = $1 AND m.queue_id = $2 AND m.winning_team IS NOT NULL
    ORDER BY m.created_at DESC
    LIMIT 4
    `,
    [userId, queueId],
  )

  const previous_games = previousRes.rows as { change: number; time: Date }[]

  const eloRes = await pool.query(
    `
    SELECT
      mu.elo_change,
      m.created_at AS date
    FROM match_users mu
    JOIN matches m ON m.id = mu.match_id
    WHERE mu.user_id = $1 AND m.queue_id = $2 AND m.winning_team IS NOT NULL
    ORDER BY m.id
    `,
    [userId, queueId],
  )

  let eloChanges = eloRes.rows.map((r: any) => ({
    change: Number(r.elo_change) || 0,
    date: r.date as Date,
  }))

  const totalChange = eloChanges.reduce((sum, r) => sum + r.change, 0)
  let running = (p.elo ?? 0) - totalChange
  const elo_graph_data = eloChanges.map((r) => {
    running += r.change
    return { date: r.date, rating: running }
  })

  // Calculate percentiles for each stat using CTEs
  const percentilesRes = await pool.query(
    `
    WITH player_stats AS (
      SELECT
        qu.user_id,
        COUNT(CASE WHEN m.winning_team = mu.team THEN 1 END)::integer as wins,
        COUNT(CASE WHEN m.winning_team IS NOT NULL AND m.winning_team != mu.team THEN 1 END)::integer as losses,
        COUNT(CASE WHEN m.winning_team IS NOT NULL THEN 1 END)::integer as games_played,
        CASE
          WHEN COUNT(CASE WHEN m.winning_team IS NOT NULL THEN 1 END) > 0
          THEN COUNT(CASE WHEN m.winning_team = mu.team THEN 1 END)::float / COUNT(CASE WHEN m.winning_team IS NOT NULL THEN 1 END)
          ELSE 0
        END as winrate
      FROM queue_users qu
      LEFT JOIN match_users mu ON mu.user_id = qu.user_id
      LEFT JOIN matches m ON m.id = mu.match_id AND m.queue_id = $1
      WHERE qu.queue_id = $1
      GROUP BY qu.user_id
    )
    SELECT
      COUNT(*) as total_players,
      COUNT(CASE WHEN wins < $2 THEN 1 END) as wins_rank,
      COUNT(CASE WHEN losses > $3 THEN 1 END) as losses_rank,
      COUNT(CASE WHEN games_played < $4 THEN 1 END) as games_rank,
      COUNT(CASE WHEN winrate < $5 THEN 1 END) as winrate_rank
    FROM player_stats
    `,
    [
      queueId,
      wins,
      losses,
      games_played,
      games_played > 0 ? wins / games_played : 0,
    ],
  )

  const playerCount = parseInt(percentilesRes.rows[0].total_players)
  const winsPercentile =
    playerCount > 0
      ? (parseInt(percentilesRes.rows[0].wins_rank) / playerCount) * 100
      : 0
  const lossesPercentile =
    playerCount > 0
      ? (parseInt(percentilesRes.rows[0].losses_rank) / playerCount) * 100
      : 0
  const gamesPercentile =
    playerCount > 0
      ? (parseInt(percentilesRes.rows[0].games_rank) / playerCount) * 100
      : 0
  const winratePercentile =
    playerCount > 0
      ? (parseInt(percentilesRes.rows[0].winrate_rank) / playerCount) * 100
      : 0

  // Winrate calculation
  const winrate = games_played > 0 ? (wins / games_played) * 100 : 0

  // For stats where higher is better (wins, games, winrate):
  // - percentile represents % of players worse than you
  // - if >= 50, show as "TOP (100-percentile)%"
  // - if < 50, show as "BOTTOM percentile%"
  //
  // For stats where lower is better (losses):
  // - percentile represents % of players with MORE losses (i.e., doing worse)
  // - flip to show: if >= 50 losses percentile, show as "TOP (100-percentile)%"
  // - if < 50, show as "BOTTOM (100-percentile)%"

  const stats: {
    label: string
    value: string
    percentile: number
    isTop: boolean
  }[] = [
    {
      label: 'WINS',
      value: String(wins),
      percentile:
        winsPercentile >= 50
          ? Math.round(100 - winsPercentile)
          : Math.round(winsPercentile),
      isTop: winsPercentile >= 50,
    },
    {
      label: 'LOSSES',
      value: String(losses),
      percentile: Math.round(100 - lossesPercentile),
      isTop: lossesPercentile >= 50,
    },
    {
      label: 'GAMES',
      value: String(games_played),
      percentile:
        gamesPercentile >= 50
          ? Math.round(100 - gamesPercentile)
          : Math.round(gamesPercentile),
      isTop: gamesPercentile >= 50,
    },
    {
      label: 'WINRATE',
      value: `${Math.round(winrate)}%`,
      percentile:
        winratePercentile >= 50
          ? Math.round(100 - winratePercentile)
          : Math.round(winratePercentile),
      isTop: winratePercentile >= 50,
    },
  ]

  const leaderboardPos = await getLeaderboardPosition(queueId, userId)

  const data: StatsCanvasPlayerData = {
    user_id: p.user_id,
    name: '',
    mmr: p.elo,
    peak_mmr: p.peak_elo,
    win_streak: p.win_streak,
    stats,
    previous_games,
    elo_graph_data,
    rank_name: null,
    rank_color: null,
    rank_mmr: null,
    next_rank_name: null,
    next_rank_mmr: null,
    next_rank_color: null,
    leaderboard_position: leaderboardPos,
  }

  try {
    // Try leaderboard role first (prioritized)
    const leaderboardRole = await getLeaderboardQueueRole(queueId, userId)

    if (leaderboardRole) {
      // User has a leaderboard role - display it with position-based bar
      const guild =
        client.guilds.cache.get(process.env.GUILD_ID!) ??
        (await client.guilds.fetch(process.env.GUILD_ID!))
      const role =
        guild.roles.cache.get(leaderboardRole.role_id) ||
        (await guild.roles.fetch(leaderboardRole.role_id))
      if (role) {
        const colorNumber = (role as any).color as number
        const hex =
          `#${colorNumber.toString(16).padStart(6, '0')}`.toUpperCase()
        data.rank_name = role.name
        data.rank_color = hex
        data.rank_mmr = null // No MMR threshold for leaderboard roles
        data.rank_position = leaderboardRole.leaderboard_min

        // Get next leaderboard role (lower leaderboard_min = higher rank)
        const nextLeaderboardRoleRes = await pool.query(
          `
          SELECT *
          FROM queue_roles
          WHERE queue_id = $1
            AND leaderboard_min IS NOT NULL
            AND leaderboard_min < $2
          ORDER BY leaderboard_min DESC
          LIMIT 1
        `,
          [queueId, leaderboardRole.leaderboard_min],
        )

        if (
          nextLeaderboardRoleRes.rowCount &&
          nextLeaderboardRoleRes.rowCount > 0
        ) {
          const nextLbRole = nextLeaderboardRoleRes.rows[0]
          const nextRole =
            guild.roles.cache.get(nextLbRole.role_id) ||
            (await guild.roles.fetch(nextLbRole.role_id))
          if (nextRole) {
            const nextColorNumber = (nextRole as any).color as number
            const nextHex =
              `#${nextColorNumber.toString(16).padStart(6, '0')}`.toUpperCase()
            data.next_rank_name = nextRole.name
            data.next_rank_color = nextHex
            data.next_rank_position = nextLbRole.leaderboard_min
          }
        }
      }
    } else {
      // Fall back to MMR-based role
      const queueRole = await getUserQueueRole(queueId, userId)
      if (queueRole) {
        const guild =
          client.guilds.cache.get(process.env.GUILD_ID!) ??
          (await client.guilds.fetch(process.env.GUILD_ID!))
        const role =
          guild.roles.cache.get(queueRole.role_id) ||
          (await guild.roles.fetch(queueRole.role_id))
        if (role) {
          const colorNumber = (role as any).color as number
          const hex =
            `#${colorNumber.toString(16).padStart(6, '0')}`.toUpperCase()
          data.rank_name = role.name
          data.rank_color = hex
          data.rank_mmr = queueRole.mmr_threshold
        }
      }

      // Get the next rank role (only for MMR-based roles)
      const nextRankRes = await pool.query(
        `
        SELECT *
        FROM queue_roles
        WHERE queue_id = $1 AND mmr_threshold > $2
        ORDER BY mmr_threshold
        LIMIT 1
      `,
        [queueId, p.elo],
      )

      if (nextRankRes.rowCount && nextRankRes.rowCount > 0) {
        const nextRank = nextRankRes.rows[0]
        const guild =
          client.guilds.cache.get(process.env.GUILD_ID!) ??
          (await client.guilds.fetch(process.env.GUILD_ID!))
        const nextRole =
          guild.roles.cache.get(nextRank.role_id) ||
          (await guild.roles.fetch(nextRank.role_id))
        if (nextRole) {
          const colorNumber = (nextRole as any).color as number
          const hex =
            `#${colorNumber.toString(16).padStart(6, '0')}`.toUpperCase()
          data.next_rank_name = nextRole.name
          data.next_rank_mmr = nextRank.mmr_threshold
          data.next_rank_color = hex
        }
      }
    }
  } catch {
    // ignore errors; leave rank fields null
  }

  return data
}

// -- Rating Functions --
export const strikeUtils = {
  addStrike,
  getUserStrikes,
  getUserIdsWithStrikes,
  removeStrikeById,
  getStrikeFromId,
  checkForInstances,
}

// checks to see if the user has any recorded instances of a strike or warning\
export async function checkForInstances(userId: string) {
  const res = await pool.query(
    `
    SELECT id FROM strikes WHERE user_id = $1`,
    [userId],
  )
  return !!res.rows[0]
}

// remove a strike form a user TODO: maybe make this just disable the strike so we still have a permanent record
export async function removeStrikeById(strikeId: string) {
  await pool.query(
    `
  DELETE FROM strikes WHERE id = $1`,
    [strikeId],
  )
}

// add a strike to a user
export async function addStrike(res: Strikes): Promise<void> {
  const result = await pool.query(
    /* sql */ `
    INSERT INTO strikes (user_id, reason, issued_by_id, issued_at, expires_at, amount, reference)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `,
    [
      res.user_id,
      res.reason,
      res.issued_by_id,
      res.issued_at,
      res.expires_at,
      res.amount,
      res.reference,
    ],
  )
  return result.rows[0].id
}

// get all the strikes for a certain user
export async function getUserStrikes(userId: string): Promise<Strikes[]> {
  const res = await pool.query(
    `
    SELECT * FROM strikes WHERE user_id = $1
  `,
    [userId],
  )
  return res.rows
}

// get strike row based on id
export async function getStrikeFromId(id: string): Promise<Strikes> {
  const res = await pool
    .query(`SELECT * FROM strikes WHERE id = $1`, [id])
    .catch()
  return res.rows[0]
}

// get all users with strikes
export async function getUserIdsWithStrikes(): Promise<string[]> {
  const res = await pool
    .query(
      `
    SELECT user_id FROM strikes
    `,
    )
    .catch()
  return res?.rows.map((user) => user.user_id)
}

export async function setDecayValues(d: {
  threshold: number
  amount: number
  interval: number
  grace: number
}) {
  const res = await pool.query(
    `
    UPDATE settings
    SET
      decay_threshold = $1,
      decay_amount    = $2,
      decay_interval  = $3,
      decay_grace     = $4
    WHERE singleton = true
    `,
    [d.threshold, d.amount, d.interval, d.grace],
  )

  if (res.rowCount === 0) {
    throw new Error('no settings yet, please setup bot')
  }
}

// return all users who have is_decay == true
export async function getDecayUsers(): Promise<{ user_id: string }[]> {
  const res = await pool.query(
    `SELECT user_id FROM queue_users WHERE is_decay = true`,
  )
  return res.rows
}

// set users above the mmr threshold (and who aren't already decaying) to start decaying, adding a last decay date to account for the grace period
export async function addIsDecayToUsers(
  decay_threshold: number,
  decay_grace: number,
  decay_interval: number,
) {
  await pool.query(
    `
    UPDATE queue_users SET (is_decay, last_decay) = (true, clock_timestamp() + ($1::double precision * interval '1 hour')) WHERE (elo >= $2) AND (is_decay = false)
  `,
    [decay_grace, decay_threshold],
  )
}

// remove decay from users who are below the threshold and who currently have decay or a not null last_decay
export async function removeIsDecayFromUsers(decay_threshold: number) {
  await pool.query(
    `
      UPDATE queue_users SET (is_decay, last_decay) = (false, null) WHERE (elo < $1) AND ((is_decay = true) OR (last_decay IS DISTINCT FROM null)) RETURNING user_id
  `,
    [decay_threshold],
  )
}

// decay users who have is_decay == true
export async function applyDecayToUsers(
  decay_interval: number,
  decay_amount: number,
) {
  await pool.query(
    `
    UPDATE queue_users SET elo = greatest(elo - $1::numeric, 0::numeric), last_decay = clock_timestamp() 
                       WHERE is_decay 
                         AND ((last_decay IS null) 
                                             OR (last_decay <= clock_timestamp() - ($2::double precision * interval '1 hour'))) 
  `,
    [decay_amount, decay_interval],
  )
}

// Get user's default deck bans for a queue (returns deck IDs)
export async function getUserDefaultDeckBans(
  userId: string,
  queueId: number,
): Promise<number[]> {
  const res = await pool.query(
    `
    SELECT deck_id FROM user_default_deck_bans
    WHERE user_id = $1 AND queue_id = $2
    `,
    [userId, queueId],
  )

  return res.rows.map((row) => row.deck_id)
}

// Set user's default deck bans for a queue (replaces all existing bans)
export async function setUserDefaultDeckBans(
  userId: string,
  queueId: number,
  deckIds: number[],
): Promise<void> {
  // Delete existing bans for this user/queue
  await pool.query(
    `
    DELETE FROM user_default_deck_bans
    WHERE user_id = $1 AND queue_id = $2
    `,
    [userId, queueId],
  )

  // Insert new bans
  for (const deckId of deckIds) {
    await pool.query(
      `
      INSERT INTO user_default_deck_bans (user_id, queue_id, deck_id)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
      `,
      [userId, queueId, deckId],
    )
  }
}

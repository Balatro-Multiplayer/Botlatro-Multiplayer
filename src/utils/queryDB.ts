import { GuildMember, TextChannel, VoiceChannel } from 'discord.js'
import { pool } from '../db'
import type { Bans, Strikes, UserRoom } from 'psqlDB'
import {
  Bounty,
  CopyPaste,
  Decks,
  Matches,
  QueueRoles,
  Queues,
  Settings,
  Stakes,
  StatsCanvasPlayerData,
  UserBounty,
  teamResults,
} from 'psqlDB'
import { client, getGuild } from '../client'
import { QueryResult } from 'pg'
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
export async function getQueueRoleLock(
  queueId: number,
): Promise<string | null> {
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
  const res = await pool.query('SELECT queue_name FROM queues ORDER BY id')
  return res.rows.map((row) => row.queue_name)
}

// Get the queue ids of all queues that exist
export async function getQueueIds(): Promise<{ id: number; name: string }[]> {
  const res = await pool.query('SELECT id, queue_name FROM queues ORDER BY id')
  return res.rows.map((row) => {
    return {
      id: row.id,
      name: row.queue_name,
    }
  })
}

// check if a user is banned todo: add handling for individual queue bans when we add that
export async function checkUserBanned(member: GuildMember) {
  const res = await pool.query(`SELECT * FROM bans WHERE user_id = $1`, [
    member.id,
  ])

  return res.rowCount !== 0
}

// get all banned users
export async function getBannedUsers(): Promise<Bans[]> {
  const res = await pool.query(`SELECT * FROM bans`)

  return res.rows
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
  const res = await pool.query(
    'SELECT * FROM queues WHERE locked = false ORDER BY id DESC',
  )
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
  // Removing since we add queue roles after match ends
  // await setUserQueueRole(queueId, userId)
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

// Set DMs on or off for a user
export async function toggleUserDms(userId: string): Promise<boolean> {
  const response = await pool.query(
    `
    UPDATE users
    SET dms_enabled = NOT dms_enabled
    WHERE user_id = $1
    RETURNING dms_enabled
  `,
    [userId],
  )

  if (response.rows.length < 1) {
    const insertRes = await pool.query(
      `INSERT INTO users (user_id, dms_enabled)
        VALUES ($1, $2)
        RETURNING dms_enabled`,
      [userId, false], // If they didn't exist, we assume they want to toggle from default (true) to false
    )
    return insertRes.rows[0].dms_enabled
  }

  return response.rows[0].dms_enabled
}

// Get the DM setting for a user
export async function getUserDmsEnabled(userId: string): Promise<boolean> {
  const res = await pool.query(
    `
    SELECT dms_enabled 
    FROM users
    WHERE user_id = $1
  `,
    [userId],
  )

  if (res.rows.length < 1) {
    return true // Default to true if user not in DB
  }

  return res.rows[0].dms_enabled
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
  emote: string | null,
): Promise<boolean> {
  const res = await pool.query(
    `
    INSERT INTO queue_roles (queue_id, role_id, mmr_threshold, emote)
    VALUES ($1, $2, $3, $4)
    RETURNING queue_id
  `,
    [queueId, roleId, mmrThreshold, emote],
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

// update a queue role
export async function updateQueueRole(
  queueId: number,
  roleId: string,
  mmrThreshold?: number,
  emote?: string,
): Promise<boolean> {
  const updates: string[] = []
  const values: any[] = [queueId, roleId]
  let paramIndex = 3

  if (mmrThreshold !== undefined) {
    updates.push(`mmr_threshold = $${paramIndex}`)
    values.push(mmrThreshold)
    paramIndex++
  }

  if (emote !== undefined) {
    updates.push(`emote = $${paramIndex}`)
    values.push(emote)
    paramIndex++
  }

  if (updates.length === 0) {
    return false
  }

  const res = await pool.query(
    `
    UPDATE queue_roles
    SET ${updates.join(', ')}
    WHERE queue_id = $1 AND role_id = $2
    RETURNING queue_id
  `,
    values,
  )

  return res.rowCount !== 0
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

// Count completed games for a user in a queue
export async function countPlayerGames(
  queueId: number,
  userId: string,
): Promise<number> {
  const res = await pool.query(
    `
    SELECT COUNT(CASE WHEN m.winning_team IS NOT NULL THEN 1 END)::integer as games_played
    FROM match_users mu
    JOIN matches m ON m.id = mu.match_id
    WHERE mu.user_id = $1 AND m.queue_id = $2
    `,
    [userId, queueId],
  )
  return res.rows[0]?.games_played ?? 0
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

export async function getUsersNeedingRoleUpdates(
  queueId: number,
  players: Array<{
    user_id: string
    oldMMR: number
    newMMR: number
    oldRank: number | null
    newRank: number | null
  }>,
): Promise<string[]> {
  if (players.length === 0) return []

  const roles = await pool.query(
    `SELECT mmr_threshold FROM queue_roles
     WHERE queue_id = $1 AND mmr_threshold IS NOT NULL
     ORDER BY mmr_threshold DESC`,
    [queueId],
  )

  const leaderboardRoles = await pool.query(
    `SELECT leaderboard_min, leaderboard_max FROM queue_roles
     WHERE queue_id = $1 AND mmr_threshold IS NULL
     ORDER BY leaderboard_min DESC`,
    [queueId],
  )

  const thresholds = roles.rows.map((r) => r.mmr_threshold)
  const usersToUpdate: string[] = []

  for (const player of players) {
    const oldRole = thresholds.find((t) => t <= player.oldMMR)
    const newRole = thresholds.find((t) => t <= player.newMMR)

    if (oldRole !== newRole) {
      usersToUpdate.push(player.user_id)
    }

    // Also handle leaderboard positions
    if (
      player.oldRank !== null &&
      player.newRank !== null &&
      leaderboardRoles &&
      leaderboardRoles.rowCount !== 0
    ) {
      const oldLeaderboardRole = leaderboardRoles.rows.find(
        (r) => r.leaderboard_min <= player.oldRank!,
      )
      const newLeaderboardRole = leaderboardRoles.rows.find(
        (r) => r.leaderboard_min <= player.newRank!,
      )

      // Update leaderboard role if its not the same
      if (oldLeaderboardRole !== newLeaderboardRole) {
        usersToUpdate.push(player.user_id)
      }
    }
  }

  return usersToUpdate
}

export async function getLeaderboardPosition(
  queueId: number,
  userId: string,
  season?: number,
): Promise<number | null> {
  const activeSeason = await getActiveSeason()

  if (season !== undefined && season !== activeSeason) {
    // Historical season: rank from queue_users_seasons
    const result = await pool.query(
      `
      SELECT rank
      FROM (
        SELECT user_id, ROW_NUMBER() OVER (ORDER BY elo DESC) as rank
        FROM queue_users_seasons
        WHERE queue_id = $1 AND season = $3
      ) ranked
      WHERE user_id = $2
      `,
      [queueId, userId, season],
    )

    if (result.rowCount === 0) return null
    return result.rows[0].rank
  }

  // Current season: rank from queue_users
  const result = await pool.query(
    `
    SELECT rank
    FROM (
      SELECT user_id, ROW_NUMBER() OVER (ORDER BY elo DESC) as rank
      FROM queue_users
      WHERE queue_id = $1
    ) ranked
    WHERE user_id = $2
    `,
    [queueId, userId],
  )

  if (result.rowCount === 0) return null

  return result.rows[0].rank
}

export async function getLeaderboardQueueRole(
  queueId: number,
  userId: string,
  season?: number,
): Promise<QueueRoles | null> {
  const rank = await getLeaderboardPosition(queueId, userId, season)

  if (rank === null) return null

  const roleRes = await pool.query(
    `SELECT *
     FROM queue_roles
     WHERE queue_id = $1
       AND leaderboard_max <= $2
       AND leaderboard_min >= $2
     ORDER BY (leaderboard_min - leaderboard_max) ASC
     LIMIT 1`,
    [queueId, rank],
  )

  if (roleRes.rowCount === 0) return null
  return roleRes.rows[0]
}

export async function getUserPreviousQueueRole(
  queueId: number,
  userId: string,
): Promise<QueueRoles | null> {
  // Get the user's current role first
  const currentRole = await getUserQueueRole(queueId, userId)

  // If they don't have a current role, they can't have a previous one
  if (!currentRole || currentRole.mmr_threshold === null) return null

  // Find the highest role with threshold below the current role's threshold
  const res = await pool.query(
    `
    SELECT *
    FROM queue_roles
    WHERE queue_id = $1 AND mmr_threshold < $2 AND mmr_threshold IS NOT NULL
    ORDER BY mmr_threshold DESC
    LIMIT 1
  `,
    [queueId, currentRole.mmr_threshold],
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

export async function getDeckByName(deckName: string): Promise<Decks | null> {
  const res: QueryResult<Decks> = await pool.query(
    `SELECT * FROM decks WHERE deck_name = $1`,
    [deckName],
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
  lockPick: boolean = false,
): Promise<void> {
  await pool.query(
    `
    UPDATE matches
    SET deck = $2
    WHERE id = $1
  `,
    [matchId, deckName],
  )

  if (lockPick) {
    await pool.query(
      `
      UPDATE matches
      SET deck_vote_ended = true
      WHERE id = $1
    `,
      [matchId],
    )
  }
}

// Set the picked stake in the match data
export async function setPickedMatchStake(
  matchId: number,
  stakeName: string,
  lockPick: boolean = false,
): Promise<void> {
  await pool.query(
    `
    UPDATE matches
    SET stake = $2
    WHERE id = $1
  `,
    [matchId, stakeName],
  )

  if (lockPick) {
    await pool.query(
      `
      UPDATE matches
      SET stake_vote_ended = true
      WHERE id = $1
    `,
      [matchId],
    )
  }
}

// Set the tuple bans for a match (stores the original 7 tuples)
export async function setMatchTupleBans(
  matchId: number,
  tuples: string[],
): Promise<void> {
  await pool.query(
    `UPDATE matches SET tuple_bans = $2 WHERE id = $1`,
    [matchId, JSON.stringify(tuples)],
  )
}

// Get the tuple bans for a match
export async function getMatchTupleBans(
  matchId: number,
): Promise<string[] | null> {
  const res = await pool.query(
    `SELECT tuple_bans FROM matches WHERE id = $1`,
    [matchId],
  )
  return res.rows[0]?.tuple_bans ?? null
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

// Get match results message id
export async function getMatchResultsMessageId(
  matchId: number,
): Promise<string | null> {
  const res = await pool.query(
    `
    SELECT results_msg_id FROM matches WHERE id = $1
  `,
    [matchId],
  )

  return res.rowCount === 0 ? null : res.rows[0].results_msg_id
}

// Set match results message id
export async function setMatchResultsMessageId(
  matchId: number,
  messageId: string,
): Promise<void> {
  await pool.query(`UPDATE matches SET results_msg_id = $2 WHERE id = $1`, [
    matchId,
    messageId,
  ])
}

// Get match queue log message id
export async function getMatchQueueLogMessageId(
  matchId: number,
): Promise<string | null> {
  const res = await pool.query(
    `
    SELECT queue_log_msg_id FROM matches WHERE id = $1
  `,
    [matchId],
  )

  return res.rowCount === 0 ? null : res.rows[0].queue_log_msg_id
}

// Set match queue log message id
export async function setMatchQueueLogMessageId(
  matchId: number,
  messageId: string,
): Promise<void> {
  await pool.query(`UPDATE matches SET queue_log_msg_id = $2 WHERE id = $1`, [
    matchId,
    messageId,
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

  if (rowCount == 0) console.error('No matches found under this ID.')

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

  await resetCurrentEloRangeForUser(userId, queueId)

  return response.rowCount !== 0
}

// Checks if a user is in a match
export async function userInMatch(userId: string): Promise<boolean> {
  const guild = await getGuild()
  // gets all open matches
  const openMatches: QueryResult<Matches> = await pool.query(`
    SELECT * FROM matches
    WHERE open = true
  `)

  // checks for the requested userId (not optimised but im stupid) - casjb
  let response: any[] = []
  for (const match of openMatches.rows) {
    if (!match.channel_id) continue
    if (match.channel_id.includes('neatqueue')) continue
    const result = await pool.query(
      `
      SELECT * FROM match_users
      WHERE user_id = $1 AND match_id = $2
      `,
      [userId, match.id],
    )
    let channel: any = null
    try {
      channel =
        guild.channels.cache.get(match.channel_id) ??
        (await guild.channels.fetch(match.channel_id))
    } catch (error) {
      channel = null
    }
    if (!channel || !channel.id) {
      await pool.query(
        `
        UPDATE matches SET open = false where channel_id = $1 
      `,
        [match.channel_id],
      )
    }

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

export async function getMatchStatus(matchId: number): Promise<boolean> {
  const res = await pool.query(`SELECT open FROM matches WHERE id = $1`, [
    matchId,
  ])

  return res.rows[0].open ?? false
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
  const { decay_grace } = await getSettings()

  await pool.query(
    `UPDATE queue_users 
    SET elo = $1, 
    peak_elo = GREATEST(peak_elo, $1),
    volatility = $2,
    last_decay = clock_timestamp() + ($3::double precision * interval '1 hour')
    WHERE user_id = $4 AND queue_id = $5`,
    [clampedElo, newVolatility, decay_grace, userId, queueId],
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
  // Get current streak to determine if we need to reset
  const currentStreak = await pool.query(
    `SELECT win_streak FROM queue_users WHERE user_id = $1 AND queue_id = $2`,
    [userId, queueId],
  )

  if (currentStreak.rowCount === 0) return

  const streak = currentStreak.rows[0].win_streak

  if (won) {
    if (streak < 0) {
      // Had a loss streak, reset to 1 (first win)
      await pool.query(
        `UPDATE queue_users
         SET win_streak = 1,
             peak_win_streak = GREATEST(peak_win_streak, 1)
         WHERE user_id = $1 AND queue_id = $2`,
        [userId, queueId],
      )
    } else {
      // At 0 or already in a win streak, increment
      await pool.query(
        `UPDATE queue_users
         SET win_streak = win_streak + 1,
             peak_win_streak = GREATEST(peak_win_streak, win_streak + 1)
         WHERE user_id = $1 AND queue_id = $2`,
        [userId, queueId],
      )
    }
  } else {
    if (streak > 0) {
      // Had a win streak, reset to -1 (first loss)
      await pool.query(
        `UPDATE queue_users
         SET win_streak = -1
         WHERE user_id = $1 AND queue_id = $2`,
        [userId, queueId],
      )
    } else {
      // At 0 or already in a loss streak, decrement
      await pool.query(
        `UPDATE queue_users
         SET win_streak = win_streak - 1
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
  if (defaultEloRes.rowCount === 0) throw new Error('No default elo found.')
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
  if (response.rowCount === 0) return null
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

export async function resetAllCurrentEloRangeForUser(
  userId: string,
): Promise<void> {
  await pool.query(
    `UPDATE queue_users SET current_elo_range = 0 WHERE user_id = $1`,
    [userId],
  )
}

export async function resetCurrentEloRangeForUser(
  userId: string,
  queueId: number,
): Promise<void> {
  const queueSettings = await getQueueSettings(queueId)
  await pool.query(
    `UPDATE queue_users SET current_elo_range = $3 WHERE user_id = $1 AND queue_id = $2`,
    [userId, queueId, queueSettings.elo_search_start],
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

// get the active season from settings
export async function getActiveSeason(): Promise<number> {
  const res = await pool.query(
    'SELECT active_season FROM settings WHERE singleton = true',
  )
  return res.rows[0].active_season
}

// get the data for the statistics canvas display
export async function getStatsCanvasUserData(
  userId: string,
  queueId: number,
  season?: number,
): Promise<StatsCanvasPlayerData> {
  // 1) Core player stats for this queue
  const activeSeason = await getActiveSeason()
  const isHistorical = season !== undefined && season !== activeSeason

  let p: {
    user_id: string
    elo: number
    peak_elo: number
    win_streak: number
    peak_win_streak: number
  }

  if (isHistorical) {
    // Historical season: read from queue_users_seasons snapshot
    const snapshotRes = await pool.query(
      `
      SELECT
        qus.user_id,
        qus.elo,
        qus.peak_elo,
        qus.win_streak,
        qus.peak_win_streak
      FROM queue_users_seasons qus
      WHERE qus.user_id = $1 AND qus.queue_id = $2 AND qus.season = $3
      `,
      [userId, queueId, season],
    )

    if (snapshotRes.rowCount === 0) {
      throw new Error(
        'No player data found for this user in the specified queue and season.',
      )
    }

    p = snapshotRes.rows[0]
  } else {
    // Current season: read from queue_users
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

    p = playerRes.rows[0]
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
    ${season !== undefined ? 'AND m.season = $3' : ''}
    `,
    season !== undefined ? [userId, queueId, season] : [userId, queueId],
  )

  const wins = statsRes.rows[0]?.wins || 0
  const losses = statsRes.rows[0]?.losses || 0
  const games_played = statsRes.rows[0]?.games_played || 0

  const previousRes = await pool.query(
    `
    SELECT
      mu.elo_change AS change,
      m.created_at   AS time,
      m.stake AS stake,
      m.deck AS deck
    FROM match_users mu
    JOIN matches m ON m.id = mu.match_id
    WHERE mu.user_id = $1 AND m.queue_id = $2 AND m.winning_team IS NOT NULL
    ${season !== undefined ? 'AND m.season = $3' : ''}
    ORDER BY m.created_at DESC
    `,
    season !== undefined ? [userId, queueId, season] : [userId, queueId],
  )

  const previous_games = previousRes.rows as {
    change: number
    time: Date
    deck: string
    stake: string
  }[]

  const eloRes = await pool.query(
    `
    SELECT
      mu.elo_change,
      m.created_at AS date
    FROM match_users mu
    JOIN matches m ON m.id = mu.match_id
    WHERE mu.user_id = $1 AND m.queue_id = $2 AND m.winning_team IS NOT NULL
    ${season !== undefined ? 'AND m.season = $3' : ''}
    ORDER BY m.created_at
    `,
    season !== undefined ? [userId, queueId, season] : [userId, queueId],
  )

  let eloChanges = eloRes.rows.map((r: any) => ({
    change: Number(r.elo_change) || 0,
    date: r.date as Date,
  }))

  // Get queue default_elo for initial data point
  const queueSettings = await getQueueSettings(queueId)
  const defaultElo = queueSettings.default_elo

  let running = defaultElo

  const elo_graph_data: { date: Date; rating: number }[] = []

  // Add initial starting point if there are any matches
  if (eloChanges.length > 0) {
    const firstMatchDate = new Date(eloChanges[0].date)
    const startDate = new Date(firstMatchDate.getTime() - 1000) // 1 second before
    elo_graph_data.push({ date: startDate, rating: defaultElo })
  }

  // Add all match data points
  eloChanges.forEach((r) => {
    running += r.change
    const clampedRating = Math.max(0, Math.min(9999, running)) // Clamp between 0 and 9999
    running = clampedRating // Update running to match the clamped value for next iteration
    elo_graph_data.push({ date: r.date, rating: clampedRating })
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
        ${season !== undefined ? 'AND m.season = $6' : ''}
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
    season !== undefined
      ? [
          queueId,
          wins,
          losses,
          games_played,
          games_played > 0 ? wins / games_played : 0,
          season,
        ]
      : [
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

  const leaderboardPos = await getLeaderboardPosition(queueId, userId, season)

  // Fetch user's selected background
  const bgRes = await pool.query(
    'SELECT stat_background FROM users WHERE user_id = $1',
    [userId],
  )
  const statBackground = bgRes.rows[0]?.stat_background || 'bgMain.png'

  const data: StatsCanvasPlayerData = {
    user_id: p.user_id,
    name: '',
    mmr: p.elo,
    peak_mmr: p.peak_elo,
    win_streak: p.win_streak,
    stat_background: statBackground,
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
    const leaderboardRole = await getLeaderboardQueueRole(queueId, userId, season)

    if (leaderboardRole) {
      // User has a leaderboard role - display it with position-based bar
      const guild = await getGuild()
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
    UPDATE queue_users SET elo = greatest(elo - $1::numeric, 0::numeric), last_decay = clock_timestamp() + ($2::double precision * interval '1 hour')
                       WHERE is_decay
                         AND last_decay <= clock_timestamp()
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

// Add a bmpctu room to the db
export async function addRoomToDb(
  userId: string,
  roomId: string,
  reason: string,
) {
  // make sure user exists
  const user = await pool.query(
    `
    SELECT * FROM users WHERE user_id = $1
  `,
    [userId],
  )
  if (user.rowCount === 0) {
    await pool.query(
      `
      INSERT INTO users (user_id) VALUES ($1)
    `,
      [userId],
    )
  }
  const res = await pool.query(
    `
    INSERT INTO user_room (user_id, room_id, active, log_id, reason) VALUES ($1, $2, $3, $4, $5) RETURNING id
  `,
    [userId, roomId, true, null, reason],
  )
  return res.rows[0].id
}

// get the bmpctu category
export async function getBmpctuCategory() {
  const res = await pool.query(`
    SELECT bmpctu_category FROM settings WHERE singleton = true
  `)
  return res.rows[0].bmpctu_category
}

// get the bmpctu user for the current room
export async function getBmpctuUser(channelId: string) {
  const res = await pool.query(
    `
    SELECT user_id FROM user_room WHERE room_id = $1 AND active = true
  `,
    [channelId],
  )
  return res.rows[0].user_id
}

// set a room to inactive
export async function removeRoomFromDb(channelId: string) {
  try {
    await pool.query(
      `
      UPDATE user_room 
      SET active = false 
      WHERE room_id = $1  
    `,
      [channelId],
    )
  } catch (err) {
    console.error(err)
  }
}

// change bmpctu category
export async function changeBmpctuCategoryDb(catId: string) {
  await pool.query(
    `
    UPDATE settings SET bmpctu_category = $1 WHERE singleton = true
  `,
    [catId],
  )
}

// sets the room log channel in the db
export async function changeRoomLogChannel(channelId: string) {
  await pool.query(
    `
    UPDATE settings SET room_log_id = $1 WHERE singleton = true
  `,
    [channelId],
  )
}

// get log-message and channel id
export async function getLogAndChannelId(channelId: string, userId: string) {
  const res = await pool.query(
    `
    SELECT log_id FROM user_room WHERE room_id = $1 AND user_id = $2
  `,
    [channelId, userId],
  )
  const settingsRes = await pool.query(`
    SELECT room_log_id FROM settings WHERE singleton = true
  `)
  return {
    logId: res.rows[0].log_id,
    logChannelId: settingsRes.rows[0].room_log_id,
  }
}

// get primary key id for a room using channel and user id
export async function getPrimaryRoomId(channelId: string, userId: string) {
  const res = await pool.query(
    `
    SELECT id FROM user_room WHERE room_id = $1 AND user_id = $2
  `,
    [channelId, userId],
  )
  return res.rows[0].id
}

// gets all open rooms
export async function getAllOpenRooms(): Promise<UserRoom[]> {
  const res = await pool.query(`
    SELECT * FROM user_room WHERE active = true
  `)
  return res.rows
}

// Get leaderboard data for a queue
export async function getQueueLeaderboard(
  queueId: number,
  limit?: number,
  season?: number,
): Promise<
  Array<{
    rank: number
    id: string
    name: string | null
    mmr: number
    wins: number
    losses: number
    streak: number
    peak_mmr: number
    peak_streak: number
  }>
> {
  const activeSeason = await getActiveSeason()
  const isHistorical = season !== undefined && season !== activeSeason

  const params: any[] = [queueId]

  let seasonFilter = ''
  if (season !== undefined) {
    params.push(season)
    seasonFilter = ` AND m.season = $${params.length}`
  }

  let query: string

  if (isHistorical) {
    // Historical season: read elo/peak/streak from queue_users_seasons snapshot
    query = `
      SELECT
        qus.user_id,
        u.display_name,
        qus.elo,
        qus.peak_elo,
        qus.win_streak,
        qus.peak_win_streak,
        COUNT(CASE WHEN m.winning_team = mu.team THEN 1 END)::integer as wins,
        COUNT(CASE WHEN m.winning_team IS NOT NULL AND m.winning_team != mu.team THEN 1 END)::integer as losses
      FROM queue_users_seasons qus
      LEFT JOIN users u ON u.user_id = qus.user_id
      LEFT JOIN match_users mu ON mu.user_id = qus.user_id
      LEFT JOIN matches m ON m.id = mu.match_id AND m.queue_id = $1${seasonFilter}
      WHERE qus.queue_id = $1 AND qus.season = $2
      GROUP BY qus.user_id, u.display_name, qus.elo, qus.peak_elo, qus.win_streak, qus.peak_win_streak
      ORDER BY qus.elo DESC
    `
  } else {
    // Current season: read from queue_users
    query = `
      SELECT
        qu.user_id,
        u.display_name,
        qu.elo,
        qu.peak_elo,
        qu.win_streak,
        qu.peak_win_streak,
        COUNT(CASE WHEN m.winning_team = mu.team THEN 1 END)::integer as wins,
        COUNT(CASE WHEN m.winning_team IS NOT NULL AND m.winning_team != mu.team THEN 1 END)::integer as losses
      FROM queue_users qu
      LEFT JOIN users u ON u.user_id = qu.user_id
      LEFT JOIN match_users mu ON mu.user_id = qu.user_id
      LEFT JOIN matches m ON m.id = mu.match_id AND m.queue_id = $1${seasonFilter}
      WHERE qu.queue_id = $1
      GROUP BY qu.user_id, u.display_name, qu.elo, qu.peak_elo, qu.win_streak, qu.peak_win_streak
      HAVING COUNT(m.id) > 0
      ORDER BY qu.elo DESC
    `
  }

  if (limit) {
    query += ` LIMIT $${params.length + 1}`
    params.push(limit)
  }

  const res = await pool.query(query, params)

  return res.rows.map((row, index) => ({
    rank: index + 1,
    id: row.user_id,
    name: row.display_name || null,
    mmr: row.elo,
    wins: row.wins || 0,
    losses: row.losses || 0,
    streak: row.win_streak || 0,
    peak_mmr: row.peak_elo || 0,
    peak_streak: row.peak_win_streak || 0,
  }))
}

// Update user's display name in the database
export async function updateUserDisplayName(
  userId: string,
  displayName: string,
): Promise<void> {
  // Ensure user exists in users table
  await pool.query(
    'INSERT INTO users (user_id, display_name) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET display_name = $2',
    [userId, displayName],
  )
}

// Copy-paste functions

// Get all copy-pastes
export async function getAllCopyPastes(): Promise<CopyPaste[]> {
  const res = await pool.query('SELECT * FROM "copy_pastes" ORDER BY name')
  return res.rows
}

// Get copy-paste by name
export async function getCopyPasteByName(
  name: string,
): Promise<CopyPaste | null> {
  const res = await pool.query('SELECT * FROM "copy_pastes" WHERE name = $1', [
    name,
  ])
  return res.rows[0] || null
}

// Helper function to filter out bad mentions
function filterMentions(content: string): string {
  return content
    .replace(/@everyone/gi, 'nice try')
    .replace(/@here/gi, 'nope')
    .replace(/<@&(\d+)>/g, 'lmao')
}

// Create or update copy-paste
export async function upsertCopyPaste(
  name: string,
  content: string,
  userId: string,
): Promise<CopyPaste> {
  const sanitizedContent = filterMentions(content)

  const res = await pool.query(
    `INSERT INTO "copy_pastes" (name, content, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE
     SET content = $2, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [name, sanitizedContent, userId],
  )
  return res.rows[0]
}

// Delete copy-paste
export async function deleteCopyPaste(name: string): Promise<boolean> {
  const res = await pool.query(
    'DELETE FROM "copy_pastes" WHERE name = $1 RETURNING id',
    [name],
  )
  return res.rowCount !== 0
}

// Search copy-pastes by name (for autocomplete)
export async function searchCopyPastesByName(
  search: string,
): Promise<CopyPaste[]> {
  const res = await pool.query(
    'SELECT * FROM "copy_pastes" WHERE name ILIKE $1 ORDER BY name LIMIT 25',
    [`%${search}%`],
  )
  return res.rows
}

// -- Bounty Functions --

// Create a bounty
export async function createBounty(
  name: string,
  description: string,
  createdBy: string,
): Promise<Bounty> {
  const res = await pool.query<Bounty>(
    `INSERT INTO bounties (bounty_name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, description, createdBy],
  )
  return res.rows[0]
}

// Delete a bounty
export async function deleteBounty(bountyId: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM bounties WHERE id = $1 RETURNING id`,
    [bountyId],
  )
  return res.rowCount !== 0
}

// Get all bounties
export async function getBounties(): Promise<Bounty[]> {
  const res = await pool.query<Bounty>(
    `SELECT * FROM bounties ORDER BY id`,
  )
  return res.rows
}

// Get a bounty by name
export async function getBountyByName(
  name: string,
): Promise<Bounty | null> {
  const res = await pool.query<Bounty>(
    `SELECT * FROM bounties WHERE bounty_name = $1`,
    [name],
  )
  return res.rows[0] || null
}

// Assign a bounty to a user (auto-sets is_first if no prior completions)
export async function assignBounty(
  bountyId: number,
  userId: string,
): Promise<UserBounty> {
  // Check if anyone has completed this bounty before
  const existing = await pool.query(
    `SELECT id FROM user_bounties WHERE bounty_id = $1`,
    [bountyId],
  )
  const isFirst = existing.rowCount === 0

  const res = await pool.query<UserBounty>(
    `INSERT INTO user_bounties (bounty_id, user_id, is_first)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [bountyId, userId, isFirst],
  )
  return res.rows[0]
}

// Revoke a bounty from a user
export async function revokeBounty(
  bountyId: number,
  userId: string,
): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM user_bounties WHERE bounty_id = $1 AND user_id = $2 RETURNING id`,
    [bountyId, userId],
  )
  return res.rowCount !== 0
}

// Get all bounties for a user (with bounty details)
export async function getUserBounties(
  userId: string,
): Promise<(UserBounty & { bounty_name: string; description: string })[]> {
  const res = await pool.query(
    `SELECT ub.*, b.bounty_name, b.description
     FROM user_bounties ub
     JOIN bounties b ON b.id = ub.bounty_id
     WHERE ub.user_id = $1
     ORDER BY ub.completed_at DESC`,
    [userId],
  )
  return res.rows
}

// Get all users who completed a bounty
export async function getBountyCompletions(
  bountyId: number,
): Promise<UserBounty[]> {
  const res = await pool.query<UserBounty>(
    `SELECT * FROM user_bounties WHERE bounty_id = $1 ORDER BY completed_at`,
    [bountyId],
  )
  return res.rows
}

// Get the bounty helper role id
export async function getBountyHelperRoleId(): Promise<string | null> {
  const res = await pool.query(
    `SELECT bounty_helper_role_id FROM settings`,
  )
  return res.rows[0]?.bounty_helper_role_id || null
}

// Set the bounty helper role id
export async function setBountyHelperRoleId(
  roleId: string,
): Promise<void> {
  await pool.query(
    `UPDATE settings SET bounty_helper_role_id = $1 WHERE singleton = true`,
    [roleId],
  )
}

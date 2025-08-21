import { Channel, TextChannel } from "discord.js";
import { pool } from "../db";

// Get the queue names of all queues that exist
export async function getQueueNames(): Promise<string[]> {
  const res = await pool.query('SELECT queue_name FROM queues');
  return res.rows.map(row => row.queue_name);
}

// Get the match text channel
export async function getMatchChannel(matchId: number): Promise<TextChannel | null> {
  const { rows, rowCount } = await pool.query(`
    SELECT channel_id FROM matches
    WHERE id = $1
    `, [matchId]
  );

  if (rowCount == 0) throw Error('No matches found under this ID.');

  const client = (await import('../index')).default;
  const channel = await client.channels.fetch(rows[0].channel_id);

  if (channel instanceof TextChannel) {
    return channel;
  }

  throw new Error(`Channel is not a TextChannel for match ID ${matchId}`);
}

// Get the results channel for a match
export async function getMatchResultsChannel(matchId: number): Promise<TextChannel | null> {
  const { rows, rowCount } = await pool.query(
    `
    SELECT q.results_channel_id
    FROM matches m
    JOIN queues q ON m.queue_id = q.id
    WHERE m.id = $1
    `,
    [matchId]
  );

  if (rowCount == 0) {
    throw new Error(`No queue found for match ID ${matchId}`);
  }

  const client = (await import("../index")).default;
  const channel = await client.channels.fetch(rows[0].results_channel_id);

  if (channel instanceof TextChannel) {
    return channel;
  }
  
  throw new Error(`Channel is not a TextChannel for match ID ${matchId}`);
}


// Get users in a specified channel queue
export async function getUsersInQueue(textChannel: TextChannel): Promise<string[]> {
  const response = await pool.query(`
      SELECT u.user_id FROM queue_users u
      JOIN queues q ON u.queue_channel_id = q.channel_id
      WHERE q.channel_id = $1 AND u.queue_join_time IS NOT NULL`,
      [textChannel.id]
  );

  return response.rows.map(row => row.user_id);
}

// Checks if a user is in a match
export async function userInMatch(userId: string): Promise<boolean> {
  const response = await pool.query(`
    SELECT * FROM users
    WHERE user_id = $1 AND match_id IS NOT NULL
    `, [userId]
  );

  return response.rows.length > 0;
}

// Returns the party list for a given user
export async function getPartyList(userId: string): Promise<string[]> {
  const response = await pool.query(
      `SELECT user_id FROM users WHERE joined_party_id = $1`,
      [userId]
  );
  return response.rows.map(row => row.id);
}

// Checks if a user is currently in a specific queue
export async function userInQueue(userId: string, textChannel: TextChannel): Promise<boolean> {
    const response = await pool.query(`
        SELECT * FROM queue_users
        WHERE user_id = $1 AND queue_channel_id = $2 AND queue_join_time IS NOT NULL
        `, [userId, textChannel.id]
    );

    return response.rows.length > 0;
}
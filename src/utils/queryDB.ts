import { pool } from "../db";

export async function getQueueNames(): Promise<string[]> {
  const res = await pool.query('SELECT queue_name FROM queues');
  return res.rows.map(row => row.queue_name);
}
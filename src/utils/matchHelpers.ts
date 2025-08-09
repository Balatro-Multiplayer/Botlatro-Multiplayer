import { pool } from '../db';

export async function cancelMatch(matchId: number): Promise<boolean> {
  const res = await pool.query('DELETE FROM matches WHERE id = $1 RETURNING id', [matchId]);
  if (res.rowCount === 0) {
    return false;
  } 
  return true;
}
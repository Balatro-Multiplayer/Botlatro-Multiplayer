import { pool } from '../db'

export type ModerationAction =
  | 'ban_create'
  | 'ban_remove'
  | 'ban_update'
  | 'ban_expire'
  | 'strike_create'
  | 'strike_remove'
  | 'queue_lock'
  | 'queue_unlock'
  | 'queue_lock_all'
  | 'queue_unlock_all'
  | 'match_cancel'
  | 'season_wins_cancel'
  | 'queue_role_add'
  | 'queue_role_edit'
  | 'queue_role_delete'
  | 'leaderboard_role_add'

type LogModerationEventParams = {
  action: ModerationAction
  moderatorId: string
  targetId?: string | null
  reason?: string | null
  details?: Record<string, unknown> | null
}

export async function logModerationEvent({
  action,
  moderatorId,
  targetId,
  reason,
  details,
}: LogModerationEventParams) {
  try {
    await pool.query(
      `
        INSERT INTO moderation_events (action, moderator_id, target_id, reason, details)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        action,
        moderatorId,
        targetId ?? null,
        reason ?? null,
        details ? JSON.stringify(details) : null,
      ],
    )
  } catch (err) {
    console.error('[logModerationEvent] failed to log event:', err)
  }
}

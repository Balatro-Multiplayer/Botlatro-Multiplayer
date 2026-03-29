/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('moderation_events', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    action: {
      type: 'varchar(50)',
      notNull: true,
    },
    moderator_id: {
      type: 'varchar(30)',
      notNull: true,
    },
    target_id: {
      type: 'varchar(30)',
    },
    reason: {
      type: 'text',
    },
    details: {
      type: 'jsonb',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  })

  pgm.createIndex('moderation_events', 'action')
  pgm.createIndex('moderation_events', 'moderator_id')
  pgm.createIndex('moderation_events', 'target_id')
  pgm.createIndex('moderation_events', 'created_at')
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('moderation_events')
}

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
  pgm.createTable('match_transcript_lobby_codes', {
    match_id: {
      type: 'integer',
      notNull: true,
      references: 'matches(id)',
      onDelete: 'CASCADE',
    },
    lobby_code: {
      type: 'varchar(5)',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  })

  pgm.addConstraint(
    'match_transcript_lobby_codes',
    'match_transcript_lobby_codes_pkey',
    {
      primaryKey: ['match_id', 'lobby_code'],
    },
  )

  pgm.addConstraint(
    'match_transcript_lobby_codes',
    'match_transcript_lobby_codes_lobby_code_check',
    "CHECK (lobby_code ~ '^[A-Z]{5}$')",
  )

  pgm.createIndex('match_transcript_lobby_codes', 'match_id')
  pgm.createIndex('match_transcript_lobby_codes', 'lobby_code')
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('match_transcript_lobby_codes')
}

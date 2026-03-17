/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('votes', {
    id: { type: 'serial', primaryKey: true },
    match_id: { type: 'integer', notNull: true, references: '"matches"', onDelete: 'CASCADE' },
    user_id: { type: 'varchar(255)', notNull: true, references: '"users"(user_id)', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    vote_type: { type: 'varchar(50)', notNull: true }, // 'win', 'cancel', 'rematch', 'bo3', 'bo5'
    vote_value: { type: 'integer' }, // For win votes: team number (1, 2, etc), for others: null (presence = yes vote)
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('NOW()') },
  });

  // Index for faster lookups
  pgm.addIndex('votes', ['match_id', 'user_id']);
  pgm.addIndex('votes', ['match_id', 'vote_type']);

  // Constraint: A user can only have one active vote per match (they can change their vote)
  pgm.addConstraint('votes', 'unique_user_vote_per_match', {
    unique: ['match_id', 'user_id']
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('votes', { ifExists: true, cascade: true });
};

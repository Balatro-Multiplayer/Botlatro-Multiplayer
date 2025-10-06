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
  // Drop constraints first
  pgm.dropConstraint('queue_users', 'wins_not_negative', { ifExists: true });
  pgm.dropConstraint('queue_users', 'losses_not_negative', { ifExists: true });
  pgm.dropConstraint('queue_users', 'games_played_not_negative', { ifExists: true });

  // Drop columns (these can be calculated from match_users)
  pgm.dropColumn('queue_users', 'wins');
  pgm.dropColumn('queue_users', 'losses');
  pgm.dropColumn('queue_users', 'games_played');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Add columns back
  pgm.addColumn('queue_users', {
    wins: { type: 'integer', notNull: true, default: 0 },
    losses: { type: 'integer', notNull: true, default: 0 },
    games_played: { type: 'integer', notNull: true, default: 0 },
  });

  // Add constraints back
  pgm.addConstraint('queue_users', 'wins_not_negative', {
    check: 'wins >= 0'
  });
  pgm.addConstraint('queue_users', 'losses_not_negative', {
    check: 'losses >= 0'
  });
  pgm.addConstraint('queue_users', 'games_played_not_negative', {
    check: 'games_played >= 0'
  });
};

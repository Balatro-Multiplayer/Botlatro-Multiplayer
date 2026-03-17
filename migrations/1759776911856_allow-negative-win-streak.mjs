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
  // Drop the constraint that prevents win_streak from being negative
  pgm.dropConstraint('queue_users', 'win_streak_not_negative', { ifExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Add the constraint back
  pgm.addConstraint('queue_users', 'win_streak_not_negative', {
    check: 'win_streak >= 0'
  });
};

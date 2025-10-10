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
  // Drop unique constraint on matches.channel_id
  pgm.dropConstraint('matches', 'matches_channel_id_key', { ifExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Re-add unique constraint on matches.channel_id
  pgm.addConstraint('matches', 'matches_channel_id_key', {
    unique: 'channel_id'
  });
};

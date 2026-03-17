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
  // Add constraint to keep elo between 0 and 9999
  pgm.addConstraint('queue_users', 'elo_bounds', {
    check: 'elo >= 0 AND elo <= 9999'
  });

  // Add constraint to keep peak_elo between 0 and 9999
  pgm.addConstraint('queue_users', 'peak_elo_bounds', {
    check: 'peak_elo >= 0 AND peak_elo <= 9999'
  });

  // Clamp any existing values that are out of bounds
  pgm.sql(`
    UPDATE queue_users
    SET elo = CASE
      WHEN elo < 0 THEN 0
      WHEN elo > 9999 THEN 9999
      ELSE elo
    END,
    peak_elo = CASE
      WHEN peak_elo < 0 THEN 0
      WHEN peak_elo > 9999 THEN 9999
      ELSE peak_elo
    END
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Remove the constraints
  pgm.dropConstraint('queue_users', 'elo_bounds');
  pgm.dropConstraint('queue_users', 'peak_elo_bounds');
};

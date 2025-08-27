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
  pgm.dropColumn('queue_users', 'elo');
  pgm.addColumn('queue_users', { elo: {type: 'float'} });

  pgm.dropColumn('queue_users', 'peak_elo');
  pgm.addColumn('queue_users', { peak_elo: {type: 'float'} });

  pgm.dropColumn('queue_users', 'rating_deviation');
  pgm.addColumn('queue_users', { rating_deviation: {type: 'float'} });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('queue_users', 'elo');
  pgm.addColumn('queue_users', { elo: {type: 'integer'} });

  pgm.dropColumn('queue_users', 'peak_elo');
  pgm.addColumn('queue_users', { peak_elo: {type: 'integer'} });

  pgm.dropColumn('queue_users', 'rating_deviation');
  pgm.addColumn('queue_users', { rating_deviation: {type: 'integer'} });
};

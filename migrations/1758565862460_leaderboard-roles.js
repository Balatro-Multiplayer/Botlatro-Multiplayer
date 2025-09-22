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
  pgm.alterColumn('queue_roles', 'mmr_threshold', { type: 'real', notNull: false, default: null })
  pgm.addColumn('queue_roles', { 'leaderboard_threshold': { type: 'real', notNull: false, default: null }})
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('queue_roles', 'leaderboard_threshold')
  pgm.alterColumn('queue_roles', 'mmr_threshold', { type: 'real', notNull: true })
};

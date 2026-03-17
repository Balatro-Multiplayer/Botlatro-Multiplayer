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
  pgm.addColumn('queues', { best_of_allowed: { type: 'boolean', notNull: true, default: false } })
  pgm.addColumn('queues', { glicko_tau: { type: 'numeric', notNull: true, default: 0.35 } })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('queues', 'best_of_allowed');
  pgm.dropColumn('queues', 'glicko_tau');
};

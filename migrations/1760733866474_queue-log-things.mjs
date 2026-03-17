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
  pgm.addColumn('matches', { results_msg_id: { type: 'varchar(255)', notNull: false, default: null }})
  pgm.addColumn('matches', { queue_log_msg_id: { type: 'varchar(255)', notNull: false, default: null }})
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('matches', 'results_msg_id');
  pgm.dropColumn('matches', 'queue_log_msg_id');
};

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
  pgm.addColumn('queue_users', { is_decay: { type: 'boolean', notNull: true, default: false } });
  pgm.addColumn('queue_users', { last_decay: { type: 'timestamp with time zone', notNull: false, default: null } })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('queue_users', 'is_decay');
  pgm.dropColumn('queue_users', 'last_decay');
};

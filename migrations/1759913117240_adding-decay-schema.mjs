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
  pgm.addColumn('settings', {
    decay_threshold: { type: 'integer', notNull: true, default: 460 },
    decay_amount: { type: 'integer', notNull: true, default: 5 },
    decay_interval: { type: 'integer', notNull: true, default: 24 },
    decay_grace: { type: 'integer', notNull: true, default: 24*7 },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('settings', 'decay_threshold');
  pgm.dropColumn('settings', 'decay_amount');
  pgm.dropColumn('settings', 'decay_interval');
  pgm.dropColumn('settings', 'decay_grace');
};

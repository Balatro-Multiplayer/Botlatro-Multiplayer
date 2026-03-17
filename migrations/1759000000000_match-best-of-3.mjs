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
  pgm.addColumn('matches', { best_of_3: { type: 'boolean', notNull: true, default: false } })
  pgm.addColumn('matches', { best_of_5: { type: 'boolean', notNull: true, default: false } })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('matches', 'best_of_3');
  pgm.dropColumn('matches', 'best_of_5');
};

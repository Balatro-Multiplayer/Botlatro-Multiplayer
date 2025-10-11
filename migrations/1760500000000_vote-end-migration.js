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
  pgm.addColumn('matches', { deck_vote_ended: { type: 'boolean', notNull: false, default: false }});
  pgm.addColumn('matches', { stake_vote_ended: { type: 'boolean', notNull: false, default: false }});
  pgm.alterColumn('matches', 'deck', { notNull: false, default: null })
  pgm.alterColumn('matches', 'stake', { notNull: false, default: null })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('matches', 'deck_vote_ended');
  pgm.dropColumn('matches', 'stake_vote_ended');
  pgm.alterColumn('matches', 'deck', { notNull: true });
  pgm.alterColumn('matches', 'stake', { notNull: true });
};

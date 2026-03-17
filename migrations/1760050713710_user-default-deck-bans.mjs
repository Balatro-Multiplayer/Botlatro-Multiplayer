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
  pgm.createTable('user_default_deck_bans', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'varchar(255)', notNull: true, references: '"users"(user_id)', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    queue_id: { type: 'integer', notNull: true, references: '"queues"', onDelete: 'CASCADE' },
    deck_id: { type: 'integer', notNull: true, references: '"decks"', onDelete: 'CASCADE' },
  });

  pgm.addConstraint('user_default_deck_bans', 'unique_user_queue_deck', {
    unique: ['user_id', 'queue_id', 'deck_id']
  });

  pgm.addIndex('user_default_deck_bans', ['user_id', 'queue_id']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('user_default_deck_bans', { ifExists: true, cascade: true });
};

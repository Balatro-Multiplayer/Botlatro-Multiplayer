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
  pgm.dropIndex('queues', 'stake_probability', { method: 'gin' });
  pgm.dropIndex('queues', 'deck_probability', { method: 'gin' });

  pgm.dropColumns('queues', ['stake_probability', 'deck_probability']);

  pgm.createTable('stake_mults', {
    id: 'id',

    queue_id: {
      type: 'integer',
      notNull: true,
      references: 'queues',
      onDelete: 'CASCADE',
    },

    stake_id: {
      type: 'integer',
      notNull: true,
      references: 'stakes',
      onDelete: 'CASCADE',
    },

    stake_name: {
      type: 'varchar(255)',
      notNull: true,
    },

    multiplier: {
      type: 'numeric',
      notNull: true,
      default: 1,
    },
  });

  pgm.createTable('deck_mults', {
    id: 'id',

    queue_id: {
      type: 'integer',
      notNull: true,
      references: 'queues',
      onDelete: 'CASCADE',

    },

    deck_id: {
      type: 'integer',
      notNull: true,
      references: 'decks',
      onDelete: 'CASCADE',
    },

    deck_name: {
      type: 'varchar(255)',
      notNull: true,
    },

    multiplier: {
      type: 'numeric',
      notNull: true,
      default: 1,
    },
  });

  pgm.addConstraint(
    'stake_mults',
    'unique_queue_stake',
    'UNIQUE (queue_id, stake_id)'
  );

  pgm.addConstraint(
    'deck_mults',
    'unique_queue_deck',
    'UNIQUE (queue_id, deck_id)'
  );
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropConstraint('stake_mults', 'unique_queue_stake');
  pgm.dropConstraint('deck_mults', 'unique_queue_deck');

  pgm.dropTable('deck_mults');
  pgm.dropTable('stake_mults');

  pgm.addColumns('queues', {
    stake_probability: { type: 'jsonb', notNull: false, default: pgm.func("'[]'::jsonb") },
    deck_probability: { type: 'jsonb', notNull: false, default: pgm.func("'[]'::jsonb") }
  });

  pgm.createIndex('queues', 'stake_probability', { method: 'gin' });
  pgm.createIndex('queues', 'deck_probability', { method: 'gin' });
};

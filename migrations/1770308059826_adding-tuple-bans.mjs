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
  pgm.addColumns('queues', {
    use_tuple_bans: { type: 'boolean', notNull: false, default: false },

    stake_probability: { type: 'jsonb', notNull: false, default: pgm.func("'[]'::jsonb") },
    deck_probability: { type: 'jsonb', notNull: false, default: pgm.func("'[]'::jsonb") }
  });

  pgm.createIndex('queues', 'stake_probability', { method: 'gin' });
  pgm.createIndex('queues', 'deck_probability', { method: 'gin' });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropIndex('queues', 'stake_probability', { method: 'gin' });
  pgm.dropIndex('queues', 'deck_probability', { method: 'gin' });

  pgm.dropColumns('queues', ['use_tuple_bans', 'stake_probability', 'deck_probability']);
};

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
  pgm.createTable('channel_pool', {
    id: 'id',
    channel_id: { type: 'varchar(255)', notNull: true, unique: true },
    in_use: { type: 'boolean', notNull: true, default: false },
    match_id: { type: 'integer', notNull: false, default: null },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Add index for faster lookups of available channels
  pgm.createIndex('channel_pool', 'in_use');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('channel_pool');
};

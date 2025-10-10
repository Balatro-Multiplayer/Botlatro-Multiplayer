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
  pgm.createTable('user_room', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'varchar(255)', notNull: true, references: '"users"(user_id)', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    room_id: { type: 'varchar(255)', notNull: false},
    active: {type: 'boolean', notNull: true, default: false},
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('user_room');
};

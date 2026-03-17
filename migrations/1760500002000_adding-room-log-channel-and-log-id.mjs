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
  pgm.addColumns('settings', {room_log_id: { type: 'varchar(255)', notNull: false, default: null }})
  pgm.addColumns('user_room', {log_id: { type: 'varchar(255)', notNull: false, default: null }})
  pgm.addColumns('user_room', {reason: { type: 'varchar(255)', notNull: false, default: null }})
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumns('settings', 'room_log_id');
  pgm.dropColumns('user_room', 'log_id');
  pgm.dropColumns('user_room', 'reason');
};

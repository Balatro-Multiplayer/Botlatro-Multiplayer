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
  pgm.createTable('copy_pastes', {
    id: { type: 'serial', primaryKey: true },
    name: { type: 'varchar(255)', notNull: true, unique: true },
    content: { type: 'text', notNull: true },
    created_by: { type: 'varchar(255)', notNull: true, references: '"users"(user_id)', onDelete: 'CASCADE' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.createIndex('copy_pastes', 'name');
  pgm.createIndex('copy_pastes', 'created_by');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('copy_pastes');
};

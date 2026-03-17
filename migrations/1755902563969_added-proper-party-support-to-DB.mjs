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
    pgm.createTable('parties', {
        id: { type: 'serial', primaryKey: true },
        name: { type: 'varchar(255)', notNull: true },
        created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    });

    pgm.createTable('party_users', {
        id: { type: 'serial', primaryKey: true },
        party_id: { type: 'integer', notNull: true, references: '"parties"(id)', onDelete: 'CASCADE' },
        user_id: { type: 'varchar(255)', notNull: true, references: '"users"(user_id)', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        is_leader: { type: 'boolean', notNull: true, default: false },
        joined_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('party_users');
    pgm.dropTable('parties');
};

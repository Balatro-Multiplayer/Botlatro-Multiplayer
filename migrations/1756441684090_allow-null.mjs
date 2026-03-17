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
    pgm.dropColumn('settings', 'queue_message_id');
    pgm.addColumn('settings', {
        queue_message_id: { type: 'varchar(255)' },
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropColumn('settings', 'queue_message_id');
    pgm.addColumn('settings', {
        queue_message_id: { type: 'varchar(255)', notNull: true, unique: true },
    });
};
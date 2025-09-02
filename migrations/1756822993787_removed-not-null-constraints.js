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
    pgm.alterColumn('settings', 'queue_channel_id', { type: 'varchar(255)', notNull: false, default: null });
    pgm.alterColumn('settings', 'queue_results_channel_id', { type: 'varchar(255)', notNull: false, default: null });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.alterColumn('settings', 'queue_channel_id', { type: 'varchar(255)', notNull: true });
    pgm.alterColumn('settings', 'queue_results_channel_id', { type: 'varchar(255)', notNull: true });
};

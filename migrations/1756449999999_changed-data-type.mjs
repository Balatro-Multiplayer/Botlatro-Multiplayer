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
    pgm.dropColumn('queue_users', 'current_elo_range');
    pgm.addColumn('queue_users', {
        current_elo_range: { type: 'int', notNull: false, default : null },
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropColumn('queue_users', 'current_elo_range');
    pgm.addColumn('queue_users', {
        current_elo_range: { type: 'int[]', notNull: false, default : null },
    });
};

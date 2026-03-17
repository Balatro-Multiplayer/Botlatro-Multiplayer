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
    pgm.alterColumn('bans', 'expires_at', {
        type: 'timestamp with time zone',
        notNull: false,
        default: null
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.alterColumn('bans', 'expires_at', {
        type: 'timestamp with time zone',
        notNull: true,
        default: pgm.func("current_timestamp + interval '1 day'")
    });
};

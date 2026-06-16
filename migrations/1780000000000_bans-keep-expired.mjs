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
    // Expired bans are no longer deleted; keep them as a permanent record.
    // This flag marks that the one-time unban side effects (role removal, DM,
    // log) have already run, so checkBans does not re-process expired rows.
    pgm.addColumn('bans', {
        expiry_handled: { type: 'boolean', notNull: true, default: false }
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropColumn('bans', 'expiry_handled');
};

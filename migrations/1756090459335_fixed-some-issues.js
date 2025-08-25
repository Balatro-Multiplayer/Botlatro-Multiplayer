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
    pgm.addColumn('queue_users', {
        rating_deviation: { type: 'integer', notNull: true, default: 200 }
    })
    pgm.addColumn('queue_users', {
        volatility: { type: 'float', notNull: true, default: 0.06 }
    })
    pgm.addColumn('queue_users', {
        queue_id: { type: 'integer', notNull: true, references: '"queues"(id)', onDelete: 'CASCADE' }
    })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropColumn('queue_users', 'rating_deviation');
    pgm.dropColumn('queue_users', 'volatility');
    pgm.dropColumn('queue_users', 'queue_id');
};

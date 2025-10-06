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
    // Drop the old constraint that references the deleted queue_channel_id column
    pgm.dropConstraint('queue_users', 'unique_user_per_queue', { ifExists: true });

    // Add the new constraint using the queue_id column
    pgm.addConstraint('queue_users', 'unique_user_per_queue', {
        unique: ['user_id', 'queue_id']
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    // Drop the new constraint
    pgm.dropConstraint('queue_users', 'unique_user_per_queue');

    // Add back the old constraint (even though the column doesn't exist)
    pgm.addConstraint('queue_users', 'unique_user_per_queue', {
        unique: ['user_id', 'queue_channel_id']
    });
};

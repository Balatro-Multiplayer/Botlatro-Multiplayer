/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// I hate my stupid chungus life -jeff

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
    pgm.dropColumn('queues', 'category_id');
    pgm.dropColumn('queues', 'channel_id');
    pgm.dropColumn('queues', 'results_channel_id');
    pgm.dropColumn('queues', 'message_id');

    pgm.createTable('settings', {
        singleton: { type: 'boolean', primaryKey: true, default: true },
        queue_message_id: { type: 'varchar(255)', notNull: true, unique: true },
        queue_channel_id: { type: 'varchar(255)', notNull: true, unique: true },
        queue_category_id: { type: 'varchar(255)', notNull: true, unique: true },
        queue_results_channel_id: { type: 'varchar(255)', notNull: true, unique: true },
        helper_role_id: { type: 'varchar(255)', notNull: true }
    });
    
    pgm.createTable('queue_roles', {
        id: { type: 'serial', primaryKey: true },
        queue_id: { type: 'integer', notNull: true, references: '"queues"(id)', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        role_id: { type: 'varchar(255)', notNull: true },
        mmr_threshold: { type: 'real', notNull: true } 
    });

    pgm.addConstraint('queue_roles', 'queue_roles_unique', {
        unique: ['queue_id', 'role_id']
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {

    pgm.addColumn('queues', {
        category_id: { type: 'varchar(255)', notNull: true },
        channel_id: { type: 'varchar(255)', notNull: true, unique: true },
        results_channel_id: { type: 'varchar(255)', notNull: true, unique: true },
        message_id: { type: 'varchar(255)', notNull: true, unique: true },
    });

    pgm.addConstraint('queue_users', 'unique_user_per_queue', {
        unique: ['user_id', 'queue_channel_id']
    });

    pgm.dropConstraint('queue_roles', 'queue_roles_unique');
    pgm.dropTable('queue_roles');
    pgm.dropTable('settings');
};


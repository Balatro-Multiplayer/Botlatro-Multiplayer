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
    pgm.createSchema('nkqueue', { ifNotExists: true });

    pgm.createTable('queues', {
        id: { type: 'serial', primaryKey: true },
        queue_name: { type: 'varchar(255)', notNull: true, unique: true },
        category_id: { type: 'varchar(255)', notNull: true },
        channel_id: { type: 'varchar(255)', notNull: true, unique: true },
        results_channel_id: { type: 'varchar(255)', notNull: true, unique: true },
        message_id: { type: 'varchar(255)', unique: true },
        members_per_team: { type: 'integer', notNull: true },
        number_of_teams: { type: 'integer', notNull: true },
        elo_search_start: { type: 'integer', notNull: true },
        elo_search_increment: { type: 'integer', notNull: true },
        elo_search_speed: { type: 'integer', notNull: true },
        default_elo: { type: 'integer', notNull: true },
        minimum_elo: { type: 'integer' },
        maximum_elo: { type: 'integer' },
        max_party_elo_difference: { type: 'integer' },

        locked: { type: 'boolean', notNull: true, default: false },
    });

    pgm.createTable('matches', {
        id: { type: 'serial', primaryKey: true },
        queue_id: { type: 'integer', references: '"queues"', notNull: true, onDelete: 'CASCADE' },
        channel_id: { type: 'varchar(255)', notNull: true, unique: true }
    });

    pgm.createTable('users', {
        id: { type: 'serial', primaryKey: true },
        user_id: { type: 'varchar(255)', unique: true, notNull: true },

        team: { type: 'integer' },
        match_id: { type: 'integer', references: '"matches"', onDelete: 'SET NULL' },
        
        joined_party_id: { type: 'varchar(255)' },
    });

    pgm.createTable('queue_users', {
        id: { type: 'serial', primaryKey: true },
        user_id: { type: 'varchar(255)', notNull: true, references: '"users"(user_id)', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        elo: { type: 'integer', notNull: true },
        peak_elo: { type: 'integer', notNull: true },
        wins: { type: 'integer', notNull: true, default: 0 },
        losses: { type: 'integer', notNull: true, default: 0 },
        games_played: { type: 'integer', notNull: true, default: 0 },
        win_streak: { type: 'integer', notNull: true, default: 0 },
        peak_win_streak: { type: 'integer', notNull: true, default: 0 },

        queue_channel_id: { type: 'varchar(255)', notNull: true, references: '"queues"(channel_id)', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        queue_join_time: { type: 'timestamp with time zone' },
    });

    // TODO: joined party id should reference another queue user

    // Add constraints in case of invalid manually inserted data
    pgm.addConstraint('queue_users', 'elo_not_negative', {
        check: 'elo >= 0'
    });
    pgm.addConstraint('queue_users', 'peak_elo_not_negative', {
        check: 'peak_elo >= 0'
    });
    pgm.addConstraint('queue_users', 'wins_not_negative', {
        check: 'wins >= 0'
    });
    pgm.addConstraint('queue_users', 'losses_not_negative', {
        check: 'losses >= 0'
    });
    pgm.addConstraint('queue_users', 'games_played_not_negative', {
        check: 'games_played >= 0'
    });
    pgm.addConstraint('queue_users', 'win_streak_not_negative', {
        check: 'win_streak >= 0'
    });
    pgm.addConstraint('queue_users', 'peak_win_streak_not_negative', {
        check: 'peak_win_streak >= 0'
    });
    pgm.addConstraint('queue_users', 'elo_not_greater_than_peak_elo', {
        check: 'elo <= peak_elo'
    });
    pgm.addConstraint('queue_users', 'win_streak_not_greater_than_peak_win_streak', {
        check: 'win_streak <= peak_win_streak'
    });
    pgm.addConstraint('queue_users', 'unique_user_per_queue', {
        unique: ['user_id', 'queue_channel_id']
    });

    pgm.addIndex('queue_users', 'user_id');


    pgm.createTable('bans', {
        id: { type: 'serial', primaryKey: true },
        user_id: { type: 'varchar(255)', notNull: true, unique: true },
        reason: { type: 'text', notNull: true },
        expires_at: { type: 'timestamp with time zone' },
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('queues', { ifExists: true, cascade: true });
    pgm.dropTable('matches', { ifExists: true, cascade: true });
    pgm.dropTable('users', { ifExists: true, cascade: true });
    pgm.dropTable('queue_users', { ifExists: true, cascade: true });
    pgm.dropTable('bans', { ifExists: true, cascade: true });
};

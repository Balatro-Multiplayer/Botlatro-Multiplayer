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
  // Create the queue_users_seasons snapshot table
  pgm.createTable('queue_users_seasons', {
    id: 'id',
    user_id: {
      type: 'varchar(255)',
      notNull: true,
      references: 'users(user_id)',
    },
    queue_id: {
      type: 'integer',
      notNull: true,
      references: 'queues(id)',
    },
    season: {
      type: 'integer',
      notNull: true,
    },
    elo: {
      type: 'integer',
      notNull: true,
    },
    peak_elo: {
      type: 'integer',
      notNull: true,
    },
    win_streak: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    peak_win_streak: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    volatility: {
      type: 'real',
    },
  });

  // Unique constraint on (user_id, queue_id, season)
  pgm.addConstraint('queue_users_seasons', 'queue_users_seasons_unique', {
    unique: ['user_id', 'queue_id', 'season'],
  });

  // Index for fast lookups
  pgm.createIndex('queue_users_seasons', ['user_id', 'queue_id', 'season'], {
    name: 'idx_queue_users_seasons_lookup',
  });

};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('queue_users_seasons');
};

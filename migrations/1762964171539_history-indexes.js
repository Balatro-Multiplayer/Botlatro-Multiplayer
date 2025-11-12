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
  // Add composite index for matches table to optimize overall-history query
  pgm.addIndex('matches', ['queue_id', 'winning_team', 'created_at'], {
    name: 'idx_matches_queue_winner_created',
    method: 'btree'
  });

  // Add index for match_users to speed up joins on match_id
  pgm.addIndex('match_users', ['match_id'], {
    name: 'idx_match_users_match_id',
    method: 'btree'
  });

  // Add composite index for match_users to optimize user-specific queries
  pgm.addIndex('match_users', ['user_id', 'match_id'], {
    name: 'idx_match_users_user_match',
    method: 'btree'
  });

  // Add index for queue_users to speed up queue_id lookups
  pgm.addIndex('queue_users', ['queue_id'], {
    name: 'idx_queue_users_queue_id',
    method: 'btree'
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropIndex('matches', ['queue_id', 'winning_team', 'created_at'], {
    name: 'idx_matches_queue_winner_created'
  });

  pgm.dropIndex('match_users', ['match_id'], {
    name: 'idx_match_users_match_id'
  });

  pgm.dropIndex('match_users', ['user_id', 'match_id'], {
    name: 'idx_match_users_user_match'
  });

  pgm.dropIndex('queue_users', ['queue_id'], {
    name: 'idx_queue_users_queue_id'
  });
};

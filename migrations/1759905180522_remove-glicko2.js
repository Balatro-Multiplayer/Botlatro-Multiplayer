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
  pgm.dropColumn('queues', 'glicko_tau')
  pgm.dropColumn('queue_users', 'rating_deviation')
  pgm.dropColumn('queues', 'minimum_elo')
  pgm.dropColumn('queues', 'maximum_elo')
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.addColumn('queues', {
    glicko_tau: {
      type: 'float',
      notNull: true,
      default: 0.5,
    },
  })
  pgm.addColumn('queue_users', {
    rating_deviation: {
      type: 'integer',
      notNull: true,
      default: 200,
    },
  })
  pgm.addColumn('queues', {
    minimum_elo: {
      type: 'integer',
      notNull: true,
      default: -1000,
    },
  })
  pgm.addColumn('queues', {
    maximum_elo: {
      type: 'integer',
      notNull: true,
      default: 9999
    }
  })
};

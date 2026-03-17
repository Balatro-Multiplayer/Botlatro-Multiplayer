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
  pgm.addColumns('queues', {
    instaqueue_min: {
      type: 'integer',
      notNull: false,
      default: 650
    },
    instaqueue_max: {
      type: 'integer',
      notNull: false,
      default: 2000
    },
  });

  // Add constraint to ensure max is greater than min when both are set
  pgm.addConstraint('queues', 'instaqueue_caps_valid', {
    check: 'instaqueue_min IS NULL OR instaqueue_max IS NULL OR instaqueue_max >= instaqueue_min',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropConstraint('queues', 'instaqueue_caps_valid', { ifExists: true });
  pgm.dropColumns('queues', ['instaqueue_min', 'instaqueue_max']);
};

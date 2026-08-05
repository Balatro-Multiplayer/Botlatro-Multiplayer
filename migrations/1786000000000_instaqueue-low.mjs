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
    instaqueue_low_min: {
      type: 'integer',
      notNull: false,
      default: 0
    },
    instaqueue_low_max: {
      type: 'integer',
      notNull: false,
      default: 450
    },
  });

  // Add constraint to ensure max is greater than min when both are set
  pgm.addConstraint('queues', 'instaqueue_low_caps_valid', {
    check: 'instaqueue_low_min IS NULL OR instaqueue_low_max IS NULL OR instaqueue_low_max >= instaqueue_low_min',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropConstraint('queues', 'instaqueue_low_caps_valid', { ifExists: true });
  pgm.dropColumns('queues', ['instaqueue_low_min', 'instaqueue_low_max']);
};

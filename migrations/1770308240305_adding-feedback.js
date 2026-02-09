
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
  pgm.createTable('feedback', {
    id: { type: 'serial', primaryKey: true },
    approval_percent: { type: 'integer', notNull: false }, // should be from 1-100 but no validation as it doesn't really matter if there are somehow erroneous values
    user_id: { type: 'varchar(255)', notNull: true, references: '"users"(user_id)', onDelete: 'CASCADE', onUpdate: 'CASCADE' }, // the user who submitted the feedback
    extra_info: { type: 'text', notNull: false }, // any extra feedback the user wants to add
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('feedback');
};

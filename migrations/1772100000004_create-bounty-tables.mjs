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
  pgm.createTable('bounties', {
    id: { type: 'serial', primaryKey: true },
    bounty_name: { type: 'varchar(255)', notNull: true, unique: true },
    description: { type: 'text', notNull: true },
    created_by: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('NOW()') },
  });

  pgm.createTable('user_bounties', {
    id: { type: 'serial', primaryKey: true },
    bounty_id: {
      type: 'integer',
      notNull: true,
      references: 'bounties(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'varchar(255)',
      notNull: true,
      references: 'users(user_id)',
      onDelete: 'CASCADE',
    },
    is_first: { type: 'boolean', notNull: true, default: false },
    completed_at: { type: 'timestamp', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('user_bounties', 'user_bounties_bounty_user_unique', {
    unique: ['bounty_id', 'user_id'],
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('user_bounties', { ifExists: true, cascade: true });
  pgm.dropTable('bounties', { ifExists: true, cascade: true });
};

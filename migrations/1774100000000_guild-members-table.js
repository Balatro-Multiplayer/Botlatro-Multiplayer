/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pg_trgm`)

  pgm.createTable('guild_members', {
    user_id: { type: 'text', primaryKey: true },
    username: { type: 'text', notNull: true },
    display_name: { type: 'text', notNull: true },
    avatar_url: { type: 'text' },
  })

  pgm.sql(`
    CREATE INDEX guild_members_username_trgm_idx
    ON guild_members USING gin (username gin_trgm_ops)
  `)
  pgm.sql(`
    CREATE INDEX guild_members_display_name_trgm_idx
    ON guild_members USING gin (display_name gin_trgm_ops)
  `)
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('guild_members')
}

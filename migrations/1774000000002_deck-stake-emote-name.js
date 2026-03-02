/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumn('decks', {
    emote_name: { type: 'text', notNull: false, default: null },
  })

  pgm.addColumn('stakes', {
    emote_name: { type: 'text', notNull: false, default: null },
  })

  // Backfill emote_name from existing deck/stake names by stripping the suffix
  pgm.sql(`
    UPDATE decks SET emote_name = LOWER(REGEXP_REPLACE(deck_name, '\\s*Deck$', '', 'i'))
  `)

  pgm.sql(`
    UPDATE stakes SET emote_name = LOWER(REGEXP_REPLACE(stake_name, '\\s*Stake$', '', 'i'))
  `)
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn('decks', 'emote_name')
  pgm.dropColumn('stakes', 'emote_name')
}

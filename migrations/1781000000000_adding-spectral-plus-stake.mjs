/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.sql(`
    INSERT INTO stakes (stake_name, stake_emote, stake_desc, custom, emote_name) VALUES
    ('Spectral+ Stake', '<:spectralplus_stake:1442142852087025787>', 'Spectral Stake, but with even faster ante scaling.', true, 'spectralplus');
  `)
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`
    DELETE FROM stakes WHERE stake_name = 'Spectral+ Stake';
  `)
}

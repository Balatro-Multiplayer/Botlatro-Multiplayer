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

    pgm.dropColumn('users', 'joined_party_id');
    pgm.dropColumn('matches', 'winning_team');

    pgm.addColumn('users', { joined_party_id: { type: 'integer' } });
    pgm.addColumn('matches', { winning_team: { type: 'integer' } });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {

    pgm.dropColumn('users', 'joined_party_id');
    pgm.dropColumn('matches', 'winning_team');

    pgm.addColumn('users', { joined_party_id: { type: 'varchar(255)' } });
    pgm.addColumn('matches', { winning_team: { type: 'varchar(255)' } });
};

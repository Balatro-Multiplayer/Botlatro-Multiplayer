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
    pgm.createTable('strikes', {
        id: 'id',
        user_id: { type: 'varchar(255)', notNull: true },
        reason: { type: 'text', notNull: true, default: 'No reason provided' },
        issued_by_id: { type: 'varchar(255)', notNull: true, default: '1391570706701090937' }, //TODO: make this the bot's client id if the current client being used is changed
        issued_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('current_timestamp') },
        expires_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func("current_timestamp + interval '7 days'") }, // if this doesnt exist for some reason, it expires after 1 week
        amount: { type: 'integer', notNull: true, default: 0 },
        reference: { type: 'text', notNull: true, default: '1340687958906241137' } // reference to match or channel id that the strike occured in (default to queue-notes id)
    });

    pgm.addColumn('bans', {
        related_strike_ids: { type: 'integer[]', notNull: false, default: null }, // list of all strikes that led to this ban (if any)
        allowed_queue_ids: { type: 'integer[]', notNull: false, default: null } // list of queues the user is allowed to join despite the ban (just in case idk)
    });

    pgm.alterColumn('bans', 'expires_at', {
        type: 'timestamp with time zone',
        notNull: true, // made not null
        default: pgm.func("current_timestamp + interval '1 day'") // default to 1 day if no expiry is set for some reason
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropColumn('bans', 'related_strike_ids');
    pgm.dropColumn('bans', 'allowed_queue_ids');
    pgm.dropTable('strikes');
};

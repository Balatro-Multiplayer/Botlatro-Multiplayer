/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {

    pgm.createTable('decks', {
        id: { type: 'serial', primaryKey: true },
        deck_name: { type: 'text', notNull: true },
        deck_emote: { type: 'text', notNull: true },
        deck_value: { type: 'text', notNull: true },
        deck_desc: { type: 'text', notNull: true },
        custom: { type: 'boolean', notNull: true, default: false }
    })

    pgm.createTable('stakes', {
        id: { type: 'serial', primaryKey: true },
        stake_name: { type: 'text', notNull: true },
        stake_emote: { type: 'text', notNull: true },
        stake_value: { type: 'text', notNull: true },
        stake_desc: { type: 'text', notNull: true },
        custom: { type: 'boolean', notNull: true, default: false }
    })

    pgm.createTable('banned_decks', {
        queue_id: {
            type: 'integer',
            notNull: true,
            references: '"queues"',
            onDelete: 'cascade',
        },
        deck_id: {
            type: 'integer',
            notNull: true,
            references: '"decks"',
            onDelete: 'cascade',
        },
    })

    pgm.addConstraint('banned_decks', 'banned_decks_pk', {
        primaryKey: ['queue_id', 'deck_id'],
    })

    pgm.sql(`
        INSERT INTO decks (deck_name, deck_emote, deck_value, deck_desc, custom) VALUES
        ('Red Deck', '<:red_deck:1407754986598830150>', 'red_deck', '+1 Discard', false),
        ('Blue Deck', '<:blue_deck:1407755009269174342>', 'blue_deck', '+1 Hand', false),
        ('Yellow Deck', '<:yellow_deck:1407755032568533093>', 'yellow_deck', 'Start with $10', false),
        ('Green Deck', '<:green_deck:1407755057923100693>', 'green_deck', '$2 per remaining Hand, $1 per remaining Discard, no interest', false),
        ('Black Deck', '<:black_deck:1407755080748367952>', 'black_deck', '+1 Joker Slot, -1 Hand', false),
        ('Magic Deck', '<:magic_deck:1407755102122414090>', 'magic_deck', 'Start with Crystal Ball and 2 Fool', false),
        ('Nebula Deck', '<:nebula_deck:1407755121412280361>', 'nebula_deck', 'Start with Telescope, -1 Consumable slot', false),
        ('Ghost Deck', '<:ghost_deck:1407755153460690976>', 'ghost_deck', 'Spectrals in shop, start with Hex', false),
        ('Abandoned Deck', '<:abandoned_deck:1407755177909293187>', 'abandoned_deck', 'No Face Cards in Deck', false),
        ('Checkered Deck', '<:checkered_deck:1407755185157312645>', 'checkered_deck', '26 Spades/Hearts in Deck', false),
        ('Zodiac Deck', '<:zodiac_deck:1407755192933552159>', 'zodiac_deck', 'Start with Tarot/Planet Merchant and Overstock', false),
        ('Painted Deck', '<:painted_deck:1407755200525242459>', 'painted_deck', '+2 hand size, -1 Joker slot', false),
        ('Anaglyph Deck', '<:anaglyph_deck:1407755208733360271>', 'anaglyph_deck', 'Gain Double Tag after PvP Blind', false),
        ('Plasma Deck', '<:plasma_deck:1407755215083667560>', 'plasma_deck', 'Balance Chips/Mult, x2 base blind size', false),
        ('Erratic Deck', '<:erratic_deck:1407755223484596294>', 'erratic_deck', 'All Ranks/Suits randomized', false),
        ('Violet Deck', '<:violet_deck:1407823549741273171>', 'violet_deck', '+1 Voucher Slot in Shop, 50% off 1st Ante Voucher', true),
        ('Orange Deck', '<:orange_deck:1407823492757585950>', 'orange_deck', 'Start with Giga Standard Pack and 2 Hanged Man', true),
        ('Cocktail Deck', '<:cocktail_deck:1407823448729976862>', 'cocktail_deck', 'Uses 3 random deck effects at once', true),
        ('Gradient Deck', '<:gradient_deck:1407823575158882495>', 'gradient_deck', 'Cards are considered +/- 1 rank for Joker effects', true),
        ('Oracle Deck', '<:oracle_deck:1415520993002131506>', 'oracle_deck', 'Start with Clearance Sale, money is capped at $50.', true),
        ('Heidelberg Deck', '<:heidelberg_deck:1415521423673524324>', 'heidelberg_deck', 'Start with a built in Perkeo effect.', true);
    `)

    pgm.sql(`
        INSERT INTO stakes (stake_name, stake_emote, stake_value, stake_desc, custom) VALUES
        ('White Stake', '<:white_stake:1407754838108016733>', 'white_stake', 'The default Balatro experience.', false),
        ('Red Stake', '<:red_stake:1407754861944242196>', 'red_stake', 'Small blinds no longer give money.', false),
        ('Green Stake', '<:green_stake:1407754883506901063>', 'green_stake', 'Required score scales faster for each Ante.', false),
        ('Black Stake', '<:black_stake:1407754899470422129>', 'black_stake', 'Jokers can have the eternal sticker.', false),
        ('Blue Stake', '<:blue_stake:1407754917535285450>', 'blue_stake', '-1 discard per round.', false),
        ('Purple Stake', '<:purple_stake:1407754932664270940>', 'purple_stake', 'Required score scales even faster for each Ante.', false),
        ('Orange Stake', '<:orange_stake:1407754951626588273>', 'orange_stake', 'Jokers can have the perishable sticker.', false),
        ('Gold Stake', '<:gold_stake:1407754971692404776>', 'gold_stake', 'Jokers can have the rental sticker.', false),
        ('Planet Stake', '🌎', 'planet_stake', 'Orange Stake, but without the -1 discard.', true),
        ('Spectral Stake', '👻', 'spectral_stake', 'Planet Stake, but with rental jokers in the shop, and faster ante scaling.', true);
    `)
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('banned_decks')
  pgm.dropTable('queues')
  pgm.dropTable('stakes')
  pgm.dropTable('decks')
}

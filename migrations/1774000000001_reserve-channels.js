export const up = (pgm) => {
  pgm.createTable('reserve_channels', {
    id: { type: 'serial', primaryKey: true },
    channel_id: { type: 'varchar(255)', notNull: true, unique: true },
    in_use: { type: 'boolean', notNull: true, default: false },
  })
}

export const down = (pgm) => {
  pgm.dropTable('reserve_channels')
}

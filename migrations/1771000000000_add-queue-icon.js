export const up = (pgm) => {
  pgm.addColumn('queues', {
    queue_icon: {
      type: 'varchar(255)',
      notNull: false,
      default: null,
    },
  })
}

export const down = (pgm) => {
  pgm.dropColumn('queues', 'queue_icon')
}

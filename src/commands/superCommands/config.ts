import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js'

import setDefaultDeckBans from '../queues/setDefaultDeckBans'
import setPriorityQueue from '../queues/setPriorityQueue'
import queue from './queue'
import setStatsBackground from '../queues/setStatsBackground'

export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Change your configuration settings')

    .addSubcommand((sub) =>
      sub
        .setName('priority-queue')
        .setDescription(
          'Set a priority queue for when you queue in multiple queues',
        )
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue you would like to prioritize')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('preset-deck-bans')
        .setDescription('Set your preset deck bans for a queue')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue to set preset bans for')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('stats-background')
        .setDescription('Choose a background for your stats card'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'priority-queue') {
      await setPriorityQueue.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'preset-deck-bans') {
      await setDefaultDeckBans.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'stats-background') {
      await setStatsBackground.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await queue.autocomplete(interaction)
  },
}
// this supercommand should only be usable by everyone+

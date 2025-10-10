import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js'

import setDefaultDeckBans from '../queues/setDefaultDeckBans'
import setPriorityQueue from '../queues/setPriorityQueue'
import queue from './queue'

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
        .setName('default-deck-bans')
        .setDescription('Set your default deck bans for a queue')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue to set default bans for')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'priority-queue') {
      await setPriorityQueue.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'default-deck-bans') {
      await setDefaultDeckBans.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await queue.autocomplete(interaction)
  },
}

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js'

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
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'priority-queue') {
      const setPriorityQueue = require('../queues/setPriorityQueue').default;
      await setPriorityQueue.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'priority-queue') {
      const setPriorityQueue = require('../queues/setPriorityQueue').default;
      await setPriorityQueue.autocomplete(interaction)
    }
  },
}

import viewStats from '../queues/statsQueue'
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js'
import { getQueueNames } from 'utils/queryDB'

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('view stats')
    .addSubcommand((sub) =>
      sub
        .setName('queue')
        .setDescription('View your queue stats.')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue name to view stats for')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to view stats for (defaults to yourself)')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('by-date')
            .setDescription('Sort the stats by date')
            .addChoices([{ name: 'yes', value: 'yes' }])
            .setRequired(false),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'queue') {
      await viewStats.execute(interaction)
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const currentValue = interaction.options.getFocused()
    const queueNames = await getQueueNames()
    const filteredQueueNames = queueNames.filter((name) =>
      name.toLowerCase().includes(currentValue.toLowerCase()),
    )
    await interaction.respond(
      filteredQueueNames.map((name) => ({ name, value: name })).slice(0, 25),
    )
  },
}
// this supercommand should only be usable by everyone+

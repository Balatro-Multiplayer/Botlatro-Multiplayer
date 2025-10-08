import queueLock from 'commands/moderation/queueLock'
import viewStats from '../queues/viewStats'
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js'
import { getQueueNames } from 'utils/queryDB'

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('adjust things with queues')
    .addSubcommand((sub) =>
      sub
        .setName('lock')
        .setDescription('Locks a queue from being accessed.')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue name to lock')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unlock')
        .setDescription('Unlocks a queue.')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue name to unlock')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('stats')
        .setDescription('View your stats in a queue.')
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
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'lock') {
      await queueLock.execute(interaction, true)
    } else if (interaction.options.getSubcommand() === 'unlock') {
      await queueLock.execute(interaction, false)
    } else if (interaction.options.getSubcommand() === 'stats') {
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

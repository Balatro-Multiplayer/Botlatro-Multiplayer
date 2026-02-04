import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js'

import randomDeck from '../other/randomDeck'
import randomStake from '../other/randomStake'
import { getQueueNames } from '../../utils/queryDB'

export default {
  data: new SlashCommandBuilder()
    .setName('random')
    .setDescription('randomise things')
    .addSubcommand((sub) =>
      sub
        .setName('deck')
        .setDescription('Roll a random deck')
        .addStringOption((option) =>
          option
            .setName('queue-filter')
            .setDescription('Filter to a specific queues deck options')
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('stake')
        .setDescription('Roll a random stake')
        .addStringOption((option) =>
          option
            .setName('custom-stake')
            .setDescription('Whether to include custom stakes or not')
            .addChoices([{ name: 'yes', value: 'yes' }])
            .setRequired(false),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'deck') {
      await randomDeck.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'stake') {
      await randomStake.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const currentValue = interaction.options.getFocused()
    const queueNames = await getQueueNames()
    queueNames.push('All Decks')
    const filteredQueueNames = queueNames.filter((name) =>
      name.toLowerCase().includes(currentValue.toLowerCase()),
    )
    await interaction.respond(
      filteredQueueNames.map((name) => ({ name, value: name })).slice(0, 25),
    )
  },
}
// this supercommand should only be usable by everyone+

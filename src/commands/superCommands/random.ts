import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'

import randomDeck from '../other/randomDeck'
import randomStake from '../other/randomStake'

export default {
  data: new SlashCommandBuilder()
    .setName('random')
    .setDescription('randomise things')
    .addSubcommand((sub) =>
      sub.setName('deck').setDescription('Roll a random deck'),
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
}
// this supercommand should only be usable by everyone+

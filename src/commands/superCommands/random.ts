import {
  SlashCommandBuilder,
  ChatInputCommandInteraction
} from 'discord.js'

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
            .setName('custom-decks')
            .setDescription('Include custom BMP decks in random deck pool')
            .setRequired(false)
            .addChoices({ name: 'yes', value: 'yes' }),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('stake').setDescription('Roll a random stake'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'deck') {
      const randomDeck = require('../other/randomDeck').default;
      await randomDeck.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'stake') {
      const randomStake = require('../other/randomStake').default;
      await randomStake.execute(interaction)
    }
  },
}

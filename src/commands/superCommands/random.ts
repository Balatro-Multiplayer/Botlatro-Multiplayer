import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  AutocompleteInteraction,
} from 'discord.js'
import { pool } from '../../db'
import { partyUtils } from '../../utils/queryDB'

const randomDeck = require('../other/randomDeck')
const randomStake = require('../other/randomStake')

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
      await randomDeck.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'stake') {
      await randomStake.execute(interaction)
    }
  },
}

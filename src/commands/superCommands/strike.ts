import {
  SlashCommandBuilder,
  ChatInputCommandInteraction
} from 'discord.js'

import giveStrike from '../moderation/playerModeration/giveStrike'
import removeStrike from '../moderation/playerModeration/removeStrike'

export default {
  data: new SlashCommandBuilder()
    .setName('strike')
    .setDescription('strike related commands')
    .addSubcommand((sub) =>
      sub
        .setName('give')
        .setDescription('Give strike(s) to a user')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to give strike(s) to')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('strikes')
            .setDescription('Amount of strikes to give')
            .setRequired(true)
            .addChoices(
                { name: '0 (warning)', value: 0 },
                { name: '1 (no punishment)', value: 1 },
                { name: '2 (1 day QTO)', value: 2 },
                { name: '3 (3 day QTO)', value: 3 },
                { name: '4 (7 day QTO, temp tourney ban)', value: 4 },
                { name: '5 (month QTO, temp tourney ban)', value: 5 },
                { name: '6 (perma blacklist)', value: 6 },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Reason for the strike(s)')
            .setRequired(false)
            .setMaxLength(500),
        )
        .addChannelOption((option) =>
            option
                .setName('reference')
                .setDescription('Channel where incident occured')
                .setRequired(false)
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('stake').setDescription('Roll a random stake'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'deck') {
      await giveStrike.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'stake') {
      await removeStrike.execute(interaction)
    }
  },
}

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'

import giveStrike from '../moderation/playerModeration/giveStrike'
import removeStrike from '../moderation/playerModeration/removeStrike'
import { strikeAutocomplete } from '../../utils/Autocompletions'

export default {
  data: new SlashCommandBuilder()
    .setName('strike')
    .setDescription('strike related commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand((sub) =>
      sub
        .setName('give')
        .setDescription('[HELPER] Give strike(s) to a user')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to give strike(s) to')
            .setRequired(true),
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
            .setDescription('Channel where incident occurred')
            .setRequired(false),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('[HELPER] Remove strike(s) from a user')

        .addStringOption((option) =>
          option
            .setName('user')
            .setDescription('The user to remove strike(s) from')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(500),
        )

        .addStringOption((option) =>
          option
            .setName('strike')
            .setDescription('Strike to remove')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(500),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'give') {
      await giveStrike.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'remove') {
      await removeStrike.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await strikeAutocomplete(interaction)
  },
}

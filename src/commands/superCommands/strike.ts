import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js'

import giveStrike from '../moderation/playerModeration/giveStrike'
import removeStrike from '../moderation/playerModeration/removeStrike'
import { strikeUtils } from '../../utils/queryDB'
import { client } from '../../client'
import { strikeSearchAutoComplete } from '../../utils/Autocompletions'

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
        .setDescription('Remove strike(s) from a user')
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
            .setDescription('Strike to be removed')
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
    try {
      const focused = interaction.options.getFocused(true)
      const parameterName: string = focused.name
      const parameterValue: string = focused.value
      if (parameterName === 'user') {
        // display list of users with a strike
        const userIds = await strikeUtils.getUserIdsWithStrikes()

        const users = await Promise.all(
          userIds.map((userId) => client.users.fetch(userId)),
        )
        await interaction.respond(
          users.slice(0, 25).map((user) => ({
            name: user.username,
            value: user.id,
          })),
        )
      } else if (parameterName === 'strike') {
        // display autocorrect for name, body, amount, and id of strike
        const autocomplete = await strikeSearchAutoComplete(
          parameterValue,
          interaction.user.id,
          interaction,
        )
      }
    } catch (err: any) {
      console.error(err)
    }
  },
}

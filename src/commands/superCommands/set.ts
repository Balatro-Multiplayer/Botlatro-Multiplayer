import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  AutocompleteInteraction,
} from 'discord.js'

export default {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('sets things to a certain value')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('mmr')
        .setDescription('[ADMIN] Set a users MMR in a specific queue')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user whose MMR you want to change')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue that you are changing the mmr in')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addNumberOption((option) =>
          option
            .setName('new-elo')
            .setDescription('The new elo to set the user to')
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'mmr') {
      const changeMMR = require('../moderation/changeMMR').default;
      await changeMMR.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommand = interaction.options.getSubcommand()
    if (subcommand === 'mmr') {
      const changeMMR = require('../moderation/changeMMR').default;
      await changeMMR.autocomplete(interaction)
    }
  },
}

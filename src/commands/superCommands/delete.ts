import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js'

import deleteQueue from '../moderation/deleteQueue'

export default {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete Subcommands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('queue')
        .setDescription('List parties')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('[ADMIN] The queue name you would like to cancel')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'queue') {
      await deleteQueue.execute(interaction);
    }
  },
}

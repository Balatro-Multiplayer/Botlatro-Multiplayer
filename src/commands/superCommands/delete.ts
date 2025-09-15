import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  AutocompleteInteraction,
} from 'discord.js'

import deleteQueue from '../moderation/deleteQueue'
import deleteQueueRole from '../moderation/deleteQueueRole';
import { getQueueNames } from '../../utils/queryDB';
import queue from './queue';


export default {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete Subcommands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('queue')
        .setDescription('[ADMIN] Delete a queue')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue name you would like to delete')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('queue-role')
        .setDescription('[ADMIN] Delete a queue role from a queue.')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue name to remove a queue from')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The queue role you would like to remove from a queue')
            .setRequired(true)
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'queue') {
      await deleteQueue.execute(interaction);
    } else if (interaction.options.getSubcommand() === 'queue-role') {
      await deleteQueueRole.execute(interaction);
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    await queue.autocomplete(interaction);
  },
}

import queueLock from 'commands/moderation/queueLock'
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { getQueueNames } from 'utils/queryDB'
import { COMMAND_HANDLERS } from '../../command-handlers'

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('adjust things with queues')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('lock')
        .setDescription('Locks a queue from being accessed.')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue name to lock')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unlock')
        .setDescription('Unlocks a queue.')
        .addStringOption((option) =>
          option
            .setName('queue-name')
            .setDescription('The queue name to unlock')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('lock-all')
        .setDescription('Locks all queues and removes everyone from them.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unlock-all')
        .setDescription('Unlocks all queues.'),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'lock') {
      await queueLock.execute(interaction, true)
    } else if (interaction.options.getSubcommand() === 'unlock') {
      await queueLock.execute(interaction, false)
    } else if (interaction.options.getSubcommand() === 'lock-all') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const count = await COMMAND_HANDLERS.MODERATION.LOCK_ALL_QUEUES()
      await interaction.editReply(
        count > 0
          ? `Locked **${count}** queue(s) and removed all players from them.`
          : 'All queues were already locked.',
      )
    } else if (interaction.options.getSubcommand() === 'unlock-all') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const success = await COMMAND_HANDLERS.MODERATION.UNLOCK_ALL_QUEUES()
      await interaction.editReply(
        success ? 'All queues have been unlocked.' : 'Failed to unlock queues.',
      )
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const currentValue = interaction.options.getFocused()
    const queueNames = await getQueueNames()
    const filteredQueueNames = queueNames.filter((name) =>
      name.toLowerCase().includes(currentValue.toLowerCase()),
    )
    await interaction.respond(
      filteredQueueNames.map((name) => ({ name, value: name })).slice(0, 25),
    )
  },
}
// this supercommand should only be usable by mod+

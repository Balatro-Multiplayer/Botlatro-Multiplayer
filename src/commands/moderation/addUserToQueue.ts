import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  AutocompleteInteraction,
} from 'discord.js'
import { joinQueues } from '../../utils/queueHelpers'
import queue from '../superCommands/queue'
import { getQueueIdFromName } from '../../utils/queryDB'

export default {
  data: new SlashCommandBuilder()
    .setName('add-user-to-queue')
    .setDescription('[ADMIN] Forces a user into a specific queue')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('queue-name')
        .setDescription('The queue name to add a user to')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to add to the queue ')
        .setRequired(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const queueName = interaction.options.getString('queue-name', true)
      const user = interaction.options.getUser('user', true)
      const queueId = await getQueueIdFromName(queueName)
      if (!queueId) {
        await interaction.editReply({
          content: 'Invalid queue provided.',
        })
        return
      }

      await joinQueues(interaction, [`${queueId}`], user.id)

      await interaction.editReply({
        content: `Added user <@${user.id}> to ${queueName}.`,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to resend message. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to resend message. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    await queue.autocomplete(interaction)
  },
}

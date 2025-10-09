import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  AutocompleteInteraction,
} from 'discord.js'
import { createMatch } from '../../utils/queueHelpers'
import { createQueueUser, getQueueIdFromName } from '../../utils/queryDB'
import queue from '../superCommands/queue'

export default {
  data: new SlashCommandBuilder()
    .setName('setup-match')
    .setDescription('[ADMIN] Force setup a match for a queue between 2 players')
    .addStringOption((option) =>
      option
        .setName('queue-name')
        .setDescription('The name of the queue to setup a match for')
        .setAutocomplete(true)
        .setRequired(true),
    )
    .addUserOption((option) =>
      option
        .setName('first-user')
        .setDescription('The first user to bring into a match')
        .setRequired(true),
    )
    .addUserOption((option) =>
      option
        .setName('second-user')
        .setDescription('The second user to bring into a match')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const queueName = interaction.options.getString('queue-name', true)
      const queueId = await getQueueIdFromName(queueName)
      if (!queueId) {
        await interaction.reply({
          content: 'Invalid queue provided.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const firstUser = interaction.options.getUser('first-user', true)
      const secondUser = interaction.options.getUser('second-user', true)

      if (firstUser.bot || secondUser.bot) {
        await interaction.editReply({
          content: 'Bots cannot be added to the queue.',
        })
        return
      }

      for (let user of [firstUser, secondUser]) {
        await createQueueUser(user.id, queueId)
      }

      const matchChannel = await createMatch(
        [firstUser.id, secondUser.id],
        queueId,
      )

      await interaction.editReply({
        content: `Match has been setup! <#${matchChannel.id}>`,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to force setup match. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to force setup match. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await queue.autocomplete(interaction)
  },
}

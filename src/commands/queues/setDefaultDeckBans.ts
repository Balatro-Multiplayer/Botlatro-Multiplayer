import {
  ChatInputCommandInteraction,
  MessageFlags,
  AutocompleteInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import {
  getBannedDeckIds,
  getQueueIdFromName,
  getQueueNames,
  getQueueSettings,
} from '../../utils/queryDB'
import { setupDeckSelect } from '../../utils/matchHelpers'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const queueName = interaction.options.getString('queue-name', true)
      const queueId = await getQueueIdFromName(queueName)

      if (!queueId) {
        await interaction.reply({
          content: 'Invalid queue provided.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      // Get first deck ban number for this queue
      const queueSettings = await getQueueSettings(queueId)
      const maxBans = Math.floor(queueSettings.first_deck_ban_num)

      // Get banned decks for this queue
      const bannedDeckIds = await getBannedDeckIds(queueId)

      // Create deck select menu
      const deckSelectRow = await setupDeckSelect(
        `user-default-deck-bans-${queueId}`,
        `Select up to ${maxBans} default deck ban(s).`,
        1,
        maxBans,
        true,
        bannedDeckIds,
      )

      const removeDeckBans = new ButtonBuilder()
        .setCustomId(`remove-user-deck-bans-${queueId}`)
        .setLabel('Remove Default Deck Bans')
        .setStyle(ButtonStyle.Danger)

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        removeDeckBans,
      )

      await interaction.reply({
        content: `Select your default deck bans for **${queueName}** (select up to ${maxBans}):`,
        components: [deckSelectRow, buttonRow],
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to set default deck bans. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to set default deck bans. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
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

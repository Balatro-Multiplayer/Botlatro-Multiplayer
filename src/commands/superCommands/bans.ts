import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { TupleBans } from '../../utils/TupleBans'
import { isHomeGuild } from '../../utils/installContext'

// Read-only deck+stake ban generator, exposed as a slash command so it is
// usable via user-install in any server / DM. Mirrors the `!bans` text command
// but never writes any state (TupleBans only SELECTs), so it is safe outside the
// home guild. Registered for user-install in setupCommands.ts.
export default {
  data: new SlashCommandBuilder()
    .setName('bans')
    .setDescription('Generate a random set of deck + stake ban pairs')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('How many ban pairs to generate (4-20)')
        .setMinValue(4)
        .setMaxValue(20)
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const amount = interaction.options.getInteger('amount', false)

      const tupleGen = new TupleBans(1)
      await tupleGen.init()
      tupleGen.setTupleCount(amount ?? null)

      const tupleBans = tupleGen.getTupleBans()
      const foreign = !isHomeGuild(interaction)
      const output = tupleBans
        .map((tuple) => {
          if (tuple.combinedEmote) return tuple.combinedEmote
          // In a foreign (user-installed) context the home guild's emojis will
          // not render, so use the single application emotes when available.
          if (foreign && tuple.deckAppEmote && tuple.stakeAppEmote)
            return `${tuple.deckAppEmote}${tuple.stakeAppEmote}`
          return `${tuple.deckEmoji} - ${tuple.stakeEmoji}`
        })
        .join('')

      await interaction.reply({ content: output })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to generate bans. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to generate bans. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}
// this supercommand should be usable by everyone (incl. user-install)

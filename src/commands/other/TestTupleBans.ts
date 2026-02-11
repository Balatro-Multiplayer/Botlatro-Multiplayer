import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { TupleBans } from '../../utils/TupleBans'

export default {
  data: new SlashCommandBuilder()
    .setName('test-tuple-bans')
    .setDescription('generate a test round of tuple bans')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const tupleGen = new TupleBans(1)
      await tupleGen.init()
      const tupleBans = tupleGen.getTupleBans()
      const output = tupleBans
        .map((tuple) => tuple.combinedEmote ?? `${tuple.deckEmoji} - ${tuple.stakeEmoji}`)
        .join('\n')
      await interaction.editReply(`tuples generated: \n${output}`)
    } catch (err: any) {
      console.error(err)
      await interaction.editReply('error generating tuples')
    }
  },
}

import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { checkBans } from '../../utils/automaticUnbans'

export default {
  data: new SlashCommandBuilder()
    .setName('cull-bans')
    .setDescription('attempt to unban all players with an expired ban')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      await checkBans()
      await interaction.editReply('bans culled')
    } catch (err: any) {
      console.error(err)
    }
  },
}

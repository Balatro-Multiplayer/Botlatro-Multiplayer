import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'

export default {
  data: new SlashCommandBuilder()
    .setName('test-channel-creation')
    .setDescription('try to create a blank channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.guild!.channels.create({
        name: 'test-channel',
        type: 0,
      })
      await interaction.editReply(`channel created successfully`)
    } catch (err: any) {
      console.error(err)
      await interaction.editReply(`could not create channel: ${err}`)
    }
  },
}

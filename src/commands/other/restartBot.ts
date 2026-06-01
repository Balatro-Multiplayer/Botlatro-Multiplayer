import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { CommandFactory } from '../../utils/logCommandUse'

export default {
  data: new SlashCommandBuilder()
    .setName('restart-bot')
    .setDescription('WARNING: only do this if it is *NEEDED*')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    const restartLog = CommandFactory.build('restart')
    if (!restartLog) return
    restartLog.setBlame(interaction.user.displayName)
    restartLog.createEmbed()
    let status = 'PENDING'

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      console.log('token present:', !!process.env.GITHUB_ACTION_TOKEN)
      console.log(
        'token prefix:',
        process.env.GITHUB_ACTION_TOKEN?.slice(0, 10),
      )

      const res = await fetch(
        'https://api.github.com/repos/Balatro-Multiplayer/Botlatro-Multiplayer/actions/workflows/manual-deploy.yml/dispatches',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_ACTION_TOKEN}`,
            Accept: 'application/vnd.github+json',
          },
          body: JSON.stringify({ ref: 'main' }),
        },
      )

      if (res.status === 204) {
        await interaction.editReply('deployment triggered, see you in a sec!')
        await interaction.followUp({
          content: `
          # Bot restart triggered by <@${interaction.user.id}> \n-# let's hope they know what they're doing...
          `,
          ephemeral: false,
        })
      } else {
        const body = await res.text()
        console.error('github actions error:', res.status, body)
        await interaction.editReply(
          `failed to trigger deployment (${res.status})`,
        )
      }
    } catch (err: any) {
      console.error(err)
      await interaction.editReply(`something went wrong: ${err.message ?? err}`)
    } finally {
      const field = [
        {
          name: 'Status',
          value: `${status}`,
          inline: false,
        },
      ]
      restartLog.setFields(field)
      await restartLog.logCommand()
    }
  },
}

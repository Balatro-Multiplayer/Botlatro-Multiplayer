import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'

export default {
  data: new SlashCommandBuilder()
    .setName('restart-bot')
    .setDescription('WARNING: only do this if it is *NEEDED*')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

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
    }
  },
}

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import banUser from '../moderation/playerModeration/banUser'
import { getBannedUsers } from '../../utils/queryDB'
import unbanUser from '../moderation/playerModeration/unbanUser'

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Manage user bans in a queue. (Helper+ Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a queue ban to a user.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to ban from the queue')
            .setRequired(true),
        )
        .addNumberOption((option) =>
          option
            .setName('length')
            .setDescription('The length of the ban in days')
            .setRequired(true),
        )
        // todo: add this back in when we can be arsed
        // .addStringOption((option) =>
        //   option
        //     .setName('queue')
        //     .setDescription(
        //       'The queue you would like to ban the user from (blank = all queues)',
        //     )
        //     .setRequired(true)
        //     .setAutocomplete(false),
        // )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('The reason to ban this user from the queue')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a queue ban from a user.')
        .addStringOption((option) =>
          option
            .setName('user')
            .setDescription('The user to lift the ban from')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('The reason to unban this user from the queue')
            .setRequired(false),
        ),
    ),

  // todo: add autocomplete and execution for subcommand 'remove'
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'add') {
      await banUser.execute(interaction)
    } else if (interaction.options.getSubcommand() === 'remove') {
      await unbanUser.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const currentValue = interaction.options.getFocused().toLowerCase()
    const bannedUsers = await getBannedUsers()

    const users = (
      await Promise.all(
        bannedUsers.map(async ({ user_id }) => {
          try {
            return await interaction.client.users.fetch(user_id)
          } catch {
            return null
          }
        }),
      )
    ).filter((u): u is NonNullable<typeof u> => u !== null)

    const filteredUsers = users.filter((user) =>
      user.username.toLowerCase().includes(currentValue),
    )

    await interaction.respond(
      filteredUsers.slice(0, 25).map((user) => ({
        name: `${user.username}`,
        value: user.id,
      })),
    )
  },
}

// this supercommand should only be usable by helper+

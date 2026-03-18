import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js'
import { getBounties } from '../../utils/queryDB'
import createBounty from '../moderation/bounty/createBounty'
import deleteBounty from '../moderation/bounty/deleteBounty'
import assignBounty from '../moderation/bounty/assignBounty'
import revokeBounty from '../moderation/bounty/revokeBounty'
import listBounties from '../moderation/bounty/listBounties'
import checkBounties from '../moderation/bounty/checkBounties'
import bountyCompletions from '../moderation/bounty/bountyCompletions'

export default {
  data: new SlashCommandBuilder()
    .setName('bounty')
    .setDescription('Manage bounties/achievements')

    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('[ADMIN] Create a new bounty')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Name of the bounty')
            .setRequired(true)
            .setMaxLength(255),
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Description of the bounty')
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('[ADMIN] Delete a bounty')
        .addStringOption((option) =>
          option
            .setName('bounty-name')
            .setDescription('Name of the bounty to delete')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('assign')
        .setDescription('[BOUNTY HELPER] Assign a bounty to a user')
        .addStringOption((option) =>
          option
            .setName('bounty-name')
            .setDescription('Name of the bounty to assign')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to assign the bounty to')
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('revoke')
        .setDescription('[BOUNTY HELPER] Revoke a bounty from a user')
        .addStringOption((option) =>
          option
            .setName('bounty-name')
            .setDescription('Name of the bounty to revoke')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to revoke the bounty from')
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub.setName('list').setDescription('[BOUNTY HELPER] List all bounties'),
    )

    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Check bounties for a user')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to check bounties for')
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName('completions')
        .setDescription('List all users who have completed a bounty')
        .addStringOption((option) =>
          option
            .setName('bounty-name')
            .setDescription('Name of the bounty')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'create') {
      await createBounty.execute(interaction)
    } else if (subcommand === 'delete') {
      await deleteBounty.execute(interaction)
    } else if (subcommand === 'assign') {
      await assignBounty.execute(interaction)
    } else if (subcommand === 'revoke') {
      await revokeBounty.execute(interaction)
    } else if (subcommand === 'list') {
      await listBounties.execute(interaction)
    } else if (subcommand === 'check') {
      await checkBounties.execute(interaction)
    } else if (subcommand === 'completions') {
      await bountyCompletions.execute(interaction)
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase()
      const bounties = await getBounties()

      const filtered = bounties
        .filter((b) => b.bounty_name.toLowerCase().includes(focusedValue))
        .slice(0, 25)

      await interaction.respond(
        filtered.map((b) => ({
          name: b.bounty_name,
          value: b.bounty_name,
        })),
      )
    } catch (err) {
      console.error('Error in bounty autocomplete:', err)
      await interaction.respond([])
    }
  },
}

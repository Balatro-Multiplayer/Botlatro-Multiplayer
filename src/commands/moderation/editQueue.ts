import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { pool } from '../../db'
import { updateQueueMessage } from '../../utils/queueHelpers'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    // required
    const queueName = interaction.options.getString('queue-name', true)

    // optional
    const queueDesc = interaction.options.getString('queue-desc', false)
    const defaultElo = interaction.options.getInteger('default-elo', false)
    const membersPerTeam = interaction.options.getInteger(
      'members-per-team',
      false,
    )
    const numberOfTeams = interaction.options.getInteger(
      'number-of-teams',
      false,
    )
    const eloSearchStart = interaction.options.getInteger(
      'queue-elo-search-start',
      false,
    )
    const eloSearchIncrement = interaction.options.getInteger(
      'queue-elo-search-increment',
      false,
    )
    const eloSearchSpeed = interaction.options.getInteger(
      'queue-elo-search-speed',
      false,
    )
    const maxPartyEloDifference = interaction.options.getInteger(
      'max-party-elo-difference',
      false,
    )
    const bestOf = interaction.options.getBoolean('allow-best-of', false)
    const deckBanFirstNum = interaction.options.getNumber(
      'deck-ban-amount',
      false,
    )
    const deckBanSecondNum = interaction.options.getNumber(
      'deck-ban-pick-amount',
      false,
    )
    const roleLock = interaction.options.getRole('role-lock', false)
    let roleLockId = null
    if (roleLock) {
      roleLockId = roleLock.id
    }

    const vetoMmrThreshold = interaction.options.getNumber(
      'veto-mmr-threshold',
      false,
    )

    try {
      const result = await pool.query(
        `
        UPDATE queues
        SET
          queue_desc = COALESCE($2, queue_desc),
          members_per_team = COALESCE($3, members_per_team),
          number_of_teams = COALESCE($4, number_of_teams),
          elo_search_start = COALESCE($5, elo_search_start),
          elo_search_increment = COALESCE($6, elo_search_increment),
          elo_search_speed = COALESCE($7, elo_search_speed),
          default_elo = COALESCE($8, default_elo),
          max_party_elo_difference = COALESCE($9, max_party_elo_difference),
          best_of_allowed = COALESCE($10, best_of_allowed),
          first_deck_ban_num = COALESCE($11, first_deck_ban_num),
          second_deck_ban_num = COALESCE($12, second_deck_ban_num),
          role_lock_id = COALESCE($13, role_lock_id),
          veto_mmr_threshold = COALESCE($14, veto_mmr_threshold)
        WHERE queue_name = $1
        RETURNING queue_name
        `,
        [
          queueName,
          queueDesc,
          membersPerTeam,
          numberOfTeams,
          eloSearchStart,
          eloSearchIncrement,
          eloSearchSpeed,
          defaultElo,
          maxPartyEloDifference,
          bestOf,
          deckBanFirstNum,
          deckBanSecondNum,
          roleLockId,
          vetoMmrThreshold,
        ],
      )

      if (result.rowCount === 0) {
        await interaction.reply({
          content: `No queue found with the name "${queueName}".`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      await updateQueueMessage()

      await interaction.reply({
        content: `Successfully updated queue **${queueName}**.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown error'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to update queue. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to update queue. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

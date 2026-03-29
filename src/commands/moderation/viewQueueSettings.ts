import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js'
import { pool } from '../../db'
import { Queues } from 'psqlDB'

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    const queueName = interaction.options.getString('queue-name', true)

    try {
      const result = await pool.query<Queues>(
        'SELECT * FROM queues WHERE queue_name = $1',
        [queueName],
      )

      if (result.rowCount === 0) {
        await interaction.reply({
          content: `No queue found with the name "${queueName}".`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      const q = result.rows[0]

      const roleLock = q.role_lock_id ? `<@&${q.role_lock_id}>` : 'None'

      const embed = new EmbedBuilder()
        .setTitle(`${q.queue_icon ? `${q.queue_icon} ` : ''}${q.queue_name} Settings`)
        .setColor((q.color as `#${string}`) || '#FFD700')
        .setDescription(q.queue_desc || 'No description')
        .addFields(
          { name: 'Default ELO', value: `${q.default_elo}`, inline: true },
          { name: 'Members/Team', value: `${q.members_per_team}`, inline: true },
          { name: 'Teams', value: `${q.number_of_teams}`, inline: true },
          { name: 'ELO Search Start', value: `${q.elo_search_start}`, inline: true },
          { name: 'ELO Search Increment', value: `${q.elo_search_increment}`, inline: true },
          { name: 'ELO Search Speed', value: `${q.elo_search_speed}s`, inline: true },
          { name: 'Max Party ELO Diff', value: `${q.max_party_elo_difference ?? 'None'}`, inline: true },
          { name: 'Best-of Allowed', value: `${q.best_of_allowed}`, inline: true },
          { name: 'Deck Bans', value: `${q.first_deck_ban_num}`, inline: true },
          { name: 'Deck Picks', value: `${q.second_deck_ban_num}`, inline: true },
          { name: 'Use Tuple Bans', value: `${q.use_tuple_bans}`, inline: true },
          { name: 'Role Lock', value: roleLock, inline: true },
          { name: 'Veto MMR Threshold', value: `${q.veto_mmr_threshold ?? 'None'}`, inline: true },
          { name: 'Instaqueue Range', value: `${q.instaqueue_min} - ${q.instaqueue_max}`, inline: true },
          { name: 'Color', value: q.color || '#FFD700', inline: true },
          { name: 'Locked', value: `${q.locked}`, inline: true },
          { name: 'Queue Icon', value: q.queue_icon || 'None', inline: true },
        )

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown error'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to fetch queue settings. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to fetch queue settings. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextChannel } from 'discord.js';
import { pool } from '../db';
import client from '../index';
// import { QueueUsers, Users } from 'psqlDB';

export async function getTeamsInMatch(matchId: number): Promise<{ team: number, users: any[] }[]> {
  const userRes = await pool.query(`
    SELECT * FROM users
    WHERE match_id = $1
  `, [matchId]);

  if (userRes.rowCount === 0) return [];

  const teamGroups: { [key: number]: any[] } = {};

  for (const user of userRes.rows) {
    if (user.team === null) continue;

    if (!teamGroups[user.team]) {
      teamGroups[user.team] = [];
    }
    teamGroups[user.team].push(user);
  }

  return Object.entries(teamGroups).map(([team, users]) => ({
    team: Number(team),
    users,
  }));
}


export async function sendMatchInitMessages(matchId: number, textChannel: TextChannel) {

    const teamData = await getTeamsInMatch(matchId);
    // This is just for testing the layout, ^ the above does it properly
    // const teamData = [{ team: 1, users: [{user_id: '122568101995872256', elo: 250}] }, {team: 2, users: [{user_id: '122568101995872256', elo: 500}] }];
    const queueTeamSelectOptions: any[] = [];

    let teamFields: any[] = teamData.map(async (t: any) => {

    let teamQueueUsersData = await pool.query(
      `SELECT * FROM queue_users
      WHERE user_id = ANY($1)`,
      [t.users.map((u: any) => u.user_id)])

    let teamString = ``;

    if (teamQueueUsersData.rowCount == 0) return;

    for (const user of teamQueueUsersData.rows) {
      let userDiscordInfo = await client.users.fetch(user.user_id);

      teamString += `**${userDiscordInfo.displayName}** - ${user.elo}\n`;
    }
    
    queueTeamSelectOptions.push(new StringSelectMenuOptionBuilder().setLabel(`Team ${t.team}`).setDescription(`Select team ${t.team} as the winner.`).setValue(`team_${t.team}`))
    return { name: `Team ${t.team}`, value: teamString }
  })

  teamFields = await Promise.all(teamFields)
  const queueGameRow: any[] = [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('match_winner').setPlaceholder('Select the game winner!').setOptions(queueTeamSelectOptions)
  )]

  queueGameRow.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cancel-${matchId}`).setLabel('Cancel Match').setStyle(ButtonStyle.Danger))
  )

  const eloEmbed = new EmbedBuilder()
        .setTitle(`Queue #${matchId}`)
        .setFields(teamFields)
        .setColor(0xFF0000);

  await textChannel.send({ embeds: [eloEmbed], components: queueGameRow })
}

export async function cancelMatch(matchId: number): Promise<boolean> {
  const res = await pool.query('DELETE FROM matches WHERE id = $1 RETURNING id', [matchId]);
  if (res.rowCount === 0) {
    return false;
  } 
  return true;
}

export async function endMatch(winningTeamId: string, matchId: number) {
  
}

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextChannel } from 'discord.js';
import { pool } from '../db';
import client from '../index';
import _ from 'lodash-es';
import { getMatchResultsChannel } from './queryDB';

export function getRandomDeck(includeCustomDecks: boolean): string {
  const decks = [
    "<:red_deck:1407754986598830150> Red Deck",
    "<:blue_deck:1407755009269174342> Blue Deck",
    "<:yellow_deck:1407755032568533093> Yellow Deck",
    "<:green_deck:1407755057923100693> Green Deck",
    "<:black_deck:1407755080748367952> Black Deck",
    "<:magic_deck:1407755102122414090> Magic Deck",
    "<:nebula_deck:1407755121412280361> Nebula Deck",
    "<:ghost_deck:1407755153460690976> Ghost Deck",
    "<:abandoned_deck:1407755177909293187> Abandoned Deck",
    "<:checkered_deck:1407755185157312645> Checkered Deck",
    "<:zodiac_deck:1407755192933552159> Zodiac Deck",
    "<:painted_deck:1407755200525242459> Painted Deck",
    "<:anaglyph_deck:1407755208733360271> Anaglyph Deck",
    "<:plasma_deck:1407755215083667560> Plasma Deck",
    "<:erratic_deck:1407755223484596294> Erratic Deck",
    
    ...(includeCustomDecks ? [
    "<:orange_deck:1407823492757585950> Orange Deck",
    "<:violet_deck:1407823549741273171> Violet Deck",
    "<:cocktail_deck:1407823448729976862> Cocktail Deck",
    "<:gradient_deck:1407823575158882495> Gradient Deck",
    "<:sybil_deck:1407823470967918655> Sibyl Deck",
    "<:indigo_deck:1407823516967112795> Indigo Deck",
    ] : []),
  ]

  return decks[Math.floor(Math.random() * decks.length)];

}

export function getRandomStake(): string {
  const stakes = [
    "<:white_stake:1407754838108016733> White Stake",
    "<:red_stake:1407754861944242196> Red Stake",
    "<:green_stake:1407754883506901063> Green Stake",
    "<:black_stake:1407754899470422129> Black Stake",
    "<:blue_stake:1407754917535285450> Blue Stake",
    "<:purple_stake:1407754932664270940> Purple Stake",
    "<:orange_stake:1407754951626588273> Orange Stake",
    "<:gold_stake:1407754971692404776> Gold Stake"
  ]

  return stakes[Math.floor(Math.random() * stakes.length)];
}

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
  let teamPingString = ``;

  let teamFields: any[] = teamData.map(async (t: any) => {

    let teamQueueUsersData = await pool.query(
      `SELECT * FROM queue_users
      WHERE user_id = ANY($1)`,
      [t.users.map((u: any) => u.user_id)])

    let teamString = ``;
    let onePersonTeam = false;
    let onePersonTeamName;

    if (teamQueueUsersData.rowCount == 0) return;
    if (teamQueueUsersData.rowCount == 1) onePersonTeam = true;

    for (const user of teamQueueUsersData.rows) {
      let userDiscordInfo = await client.users.fetch(user.user_id);
      teamPingString += `<@${user.user_id}> `;

      if (onePersonTeam) {
        teamString += `\`${user.elo} MMR\`\n`;
        onePersonTeamName = userDiscordInfo.displayName;
      } else {
        teamString += `**${userDiscordInfo.displayName}** - ${user.elo}\n`;
      }
    }
    
    queueTeamSelectOptions.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(onePersonTeam == true ? `${onePersonTeamName}` : `Team ${t.team}`)
        .setDescription(`Select ${onePersonTeam == true ? `${onePersonTeamName}` : `team ${t.team}`} as the winner.`)
        .setValue(`winmatch_${matchId}_${t.team}`));

    teamPingString += 'vs. ';
    return { name: onePersonTeam ? `${onePersonTeamName}` : `Team ${t.team}`, value: teamString }
  })

  teamFields = await Promise.all(teamFields)
  const queueGameComponents: any[] = [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('match_winner').setPlaceholder('Select the game winner!').setOptions(queueTeamSelectOptions)
  )];

    // Slice off the last vs.
  teamPingString = teamPingString.slice(0, -4); 

  queueGameComponents.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cancel-${matchId}`).setLabel('Cancel Match').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`call-helpers-${matchId}`).setLabel('Call Helpers').setStyle(ButtonStyle.Secondary))
  )

  const eloEmbed = new EmbedBuilder()
        .setTitle(`Match #${matchId}`)
        .setFields(teamFields)
        .setColor(0xFF0000);

  const deckEmbed = new EmbedBuilder()
        .setTitle(`Deck`)
        .setDescription(`Team 1 bans 5 decks\nTeam 2 chooses 3\nTeam 1 picks 1\nAlternatively, use </random-deck:1407756759057174560> to select a random deck.`)
        .setColor(0xFF0000);

  await textChannel.send({ content: `# ${teamPingString}`, embeds: [eloEmbed, deckEmbed], components: queueGameComponents });
}

export async function cancelMatch(matchId: number): Promise<boolean> {
  const res = await pool.query('DELETE FROM matches WHERE id = $1 RETURNING id', [matchId]);
  if (res.rowCount === 0) {
    return false;
  } 
  return true;
}

export async function endMatch(winningTeamId: number, matchId: number): Promise<boolean> {
  let matchTeams = await getTeamsInMatch(matchId);
  const winningTeam = matchTeams.filter(t => t.team == winningTeamId)[0];
  const losingTeams = matchTeams.filter(t => t.team != winningTeamId);
  const resultsChannel = await getMatchResultsChannel(matchId);
  if (resultsChannel == null) throw Error('Results channel was not found!');
  const resultsFields = [];

  const resultsEmbed = new EmbedBuilder()
        .setTitle(`🏆 Winner For Match #${matchId} 🏆`)
        .setColor('Gold');

  // TODO: Add information about both teams (winningTeam and losingTeams) in here
  // PLEASE make sure to make it ONLY say teams if there is more than 1 player on each team
  // there is logic on how that type of thing is done in sendMatchInitMessages
  // it's kinda jank but it works and feels much nicer to look at

  resultsChannel.send({ embeds: [resultsEmbed] });

  await cancelMatch(matchId);
  return true;
}

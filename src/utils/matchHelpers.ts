import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextChannel } from 'discord.js';
import { pool } from '../db';
import client from '../index';
import _ from 'lodash-es';
import { closeMatch, getMatchResultsChannel, getQueueIdFromMatch, isQueueGlicko, getWinningTeamFromMatch } from './queryDB';
import { Users } from 'psqlDB';
import dotenv from 'dotenv';
import { calculateGlicko2 } from './algorithms/calculateGlicko-2';
import { teamResults, QueueUsers, matchUsers } from 'psqlDB';
import { get } from 'http';
require('dotenv').config();

dotenv.config();

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

export async function getTeamsInMatch(matchId: number): Promise<{ team: number, users: matchUsers[], winRes: number }[]> {
  const matchUserRes = await pool.query(`
    SELECT * FROM match_users
    WHERE match_id = $1
  `, [matchId]);
  const queueUserRes = await Promise.all(matchUserRes.rows.map(async (matchUser: any) => {
    return await pool.query(`
      SELECT * FROM queue_users
      WHERE user_id = $1
    `, [matchUser.user_id]);
  }));
  const userFull: matchUsers[] = matchUserRes.rows.map((matchUser, i) => ({
    ...queueUserRes[i].rows[0], // properties from queue_users
    ...matchUser                // properties from match_users 
  }));

  // return winning team id
  const winningTeamId = await getWinningTeamFromMatch(matchId);

  // if there is no matchUser instance then early return 
  if (matchUserRes.rowCount === 0) return [];

  type teamGroupType = { [key: number]: { users: any[]; winRes: number } }
  const teamGroups: teamGroupType = {};

  for (const user of userFull) {
    if (user.team === null) continue;

    if (!teamGroups[user.team]) {
      teamGroups[user.team] = { users: [], winRes: 0 };
    }
    teamGroups[user.team].users.push(user);
    teamGroups[user.team].winRes = (user.team === winningTeamId) ? 1 : 0;
  }

  return Object.entries(teamGroups).map(([team, value]) => ({
    team: Number(team),
    users: value.users as matchUsers[],
    winRes: value.winRes,
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
    return { name: onePersonTeam ? `${onePersonTeamName}` : `Team ${t.team}`, value: teamString, inline: true }
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
     
  const randomTeams = _.shuffle(teamFields);

  const deckEmbed = new EmbedBuilder()
        .setTitle(`Deck`)
        .setDescription(`**${randomTeams[0].name}** bans 5 decks\n**${randomTeams[1].name}** chooses 3 decks\n**${randomTeams[0].name}** picks 1 deck\nAlternatively, use </random-deck:1407756759057174560> to select a random deck.`)
        .setColor(0xFF0000);

  await textChannel.send({ content: `# ${teamPingString}`, embeds: [eloEmbed, deckEmbed], components: queueGameComponents });
}

export async function endMatch(matchId: number): Promise<boolean> {
  const rematchButtonRow: ActionRowBuilder<ButtonBuilder> = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rematch-${matchId}`).setLabel('Rematch').setEmoji('⚔️').setStyle(ButtonStyle.Primary)
  )

  const matchTeams = await getTeamsInMatch(matchId);
  const winningTeamId = await getWinningTeamFromMatch(matchId);
  if (!winningTeamId) { console.error(`No winning team found for match ${matchId}`); return false; }

  const queueId = await getQueueIdFromMatch(matchId);
  const isGlicko = await isQueueGlicko(queueId);
  console.log(isGlicko);

  let teamResults: teamResults | null = null;
  if (isGlicko) {
    // create our teamResults object here
    const teamResultsData: teamResults = { 
      teams: matchTeams.map(teamResult => ({
        id: teamResult.team,
        score: teamResult.winRes as 0 | 0.5 | 1,
        players: teamResult.users as matchUsers[]
      }))
    }
    
    teamResults = await calculateGlicko2(matchId, teamResultsData);
  }

  const resultsEmbed = new EmbedBuilder()
    .setTitle(`🏆 Winner For Match #${matchId} 🏆`)
    .setColor("Gold");

  // running for every team then combining at the end
  const embedFields = await Promise.all(
    (teamResults?.teams ?? []).map(async team => {

      const playerList = await Promise.all(team.players.map(player => client.users.fetch(player.user_id)))
      const playerNameList = playerList.map(user => user.displayName);

      // show name for every player in team
      const label = team.score === 1 ? `__${playerNameList.join('\n')}__` : `${playerNameList.join('\n')}`;

      // show id, elo change, new elo for every player in team
      const description = team.players.map(player => {
        return `<@${player.user_id}> ${player.elo_change} (${player.elo})`
      }).join('\n');

      // return array of objects to embedFields
      return {
        isWinningTeam: team.score === 1,
        label,
        description
      }
    })
  )

  // initialize arrays to hold fields
  const winUserLabels: string[] = [];
  const winUserDescs: string[] = [];
  const lossUserLabels: string[] = [];
  const lossUserDescs: string[] = [];

  // separate winning and losing teams
  for (const field of embedFields) {
    if (field.isWinningTeam) {
      winUserLabels.push(field.label);
      winUserDescs.push(field.description);
    }
    else {
      lossUserLabels.push(field.label);
      lossUserDescs.push(field.description);
    }
  }

  resultsEmbed.addFields(
    { name: winUserLabels.join(" / "), value: winUserDescs.join("\n"), inline: true },
    { name: lossUserLabels.join(" / "), value: lossUserDescs.join("\n"), inline: true }
  );

  const resultsChannel = await getMatchResultsChannel(matchId);
  if (!resultsChannel) { console.error(`No results channel found for match ${matchId}`); return false; }

  await closeMatch(matchId)

  await resultsChannel.send({ embeds: [resultsEmbed], components: [rematchButtonRow] });
  return true;
}

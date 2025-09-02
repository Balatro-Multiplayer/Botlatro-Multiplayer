import { ActionRowBuilder, APIEmbedField, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextChannel } from 'discord.js';
import { pool } from '../db';
import client from '../index';
import _, { random } from 'lodash-es';
import { closeMatch, getMatchResultsChannel, getQueueIdFromMatch, isQueueGlicko, getWinningTeamFromMatch, getQueueSettings, getMatchChannel } from './queryDB';
import { Deck, Stake } from 'psqlDB';
import dotenv from 'dotenv';
import { calculateGlicko2 } from './algorithms/calculateGlicko-2';
import { teamResults, MatchUsers } from 'psqlDB';
import { QueryResult } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { parseLogLines } from './transcriptHelpers';
require('dotenv').config();

dotenv.config();

export const decks: readonly Deck[] = [
  {
    deck_name: "Red Deck",
    deck_emote: "<:red_deck:1407754986598830150>",
    deck_value: "red_deck",
    deck_desc: "+1 Discard",
  },
  {
    deck_name: "Blue Deck",
    deck_emote: "<:blue_deck:1407755009269174342>",
    deck_value: "blue_deck",
    deck_desc: "+1 Hand",
  },
  {
    deck_name: "Yellow Deck",
    deck_emote: "<:yellow_deck:1407755032568533093>",
    deck_value: "yellow_deck",
    deck_desc: "Start with $10",
  },
  {
    deck_name: "Green Deck",
    deck_emote: "<:green_deck:1407755057923100693>",
    deck_value: "green_deck",
    deck_desc: "$2 per remaining Hand, $1 per remaining Discard, no interest",
  },
  {
    deck_name: "Black Deck",
    deck_emote: "<:black_deck:1407755080748367952>",
    deck_value: "black_deck",
    deck_desc: "+1 Joker Slot, -1 Hand",
  },
  {
    deck_name: "Magic Deck",
    deck_emote: "<:magic_deck:1407755102122414090>",
    deck_value: "magic_deck",
    deck_desc: "Start with Crystal Ball and 2 Fool",
  },
  {
    deck_name: "Nebula Deck",
    deck_emote: "<:nebula_deck:1407755121412280361>",
    deck_value: "nebula_deck",
    deck_desc: "Start with Telescope, -1 Consumable slot",
  },
  {
    deck_name: "Ghost Deck",
    deck_emote: "<:ghost_deck:1407755153460690976>",
    deck_value: "ghost_deck",
    deck_desc: "Spectrals in shop, start with Hex",
  },
  {
    deck_name: "Abandoned Deck",
    deck_emote: "<:abandoned_deck:1407755177909293187>",
    deck_value: "abandoned_deck",
    deck_desc: "No Face Cards in Deck",
  },
  {
    deck_name: "Checkered Deck",
    deck_emote: "<:checkered_deck:1407755185157312645>",
    deck_value: "checkered_deck",
    deck_desc: "26 Spades/Hearts in Deck",
  },
  {
    deck_name: "Zodiac Deck",
    deck_emote: "<:zodiac_deck:1407755192933552159>",
    deck_value: "zodiac_deck",
    deck_desc: "Start with Tarot/Planet Merchant and Overstock",
  },
  {
    deck_name: "Painted Deck",
    deck_emote: "<:painted_deck:1407755200525242459>",
    deck_value: "painted_deck",
    deck_desc: "+2 hand size, -1 Joker slot",
  },
  {
    deck_name: "Anaglyph Deck",
    deck_emote: "<:anaglyph_deck:1407755208733360271>",
    deck_value: "anaglyph_deck",
    deck_desc: "Gain Double Tag after PvP Blind",
  },
  {
    deck_name: "Plasma Deck",
    deck_emote: "<:plasma_deck:1407755215083667560>",
    deck_value: "plasma_deck",
    deck_desc: "Balance Chips/Mult, x2 base blind size",
  },
  {
    deck_name: "Erratic Deck",
    deck_emote: "<:erratic_deck:1407755223484596294>",
    deck_value: "erratic_deck",
    deck_desc: "All Ranks/Suits randomized",
  },
];

export const customDecks: readonly Deck[] = [
  {
    deck_name: "Violet Deck",
    deck_emote: "<:violet_deck:1407823549741273171>",
    deck_value: "violet_deck",
    deck_desc: "+1 Voucher Slot in Shop, 50% off 1st Ante Voucher",
  },
  {
    deck_name: "Orange Deck",
    deck_emote: "<:orange_deck:1407823492757585950>",
    deck_value: "orange_deck",
    deck_desc: "Start with Giga Standard Pack and 2 Hanged Man",
  },
  {
    deck_name: "Cocktail Deck",
    deck_emote: "<:cocktail_deck:1407823448729976862>",
    deck_value: "cocktail_deck",
    deck_desc: "Uses 3 random deck effects at once",
  },
  {
    deck_name: "Gradient Deck",
    deck_emote: "<:gradient_deck:1407823575158882495>",
    deck_value: "gradient_deck",
    deck_desc: "Cards are considered +/- 1 rank for Joker effects",
  },
  // {
  //   deck_name: "Indigo Deck",
  //   deck_emote: "<:indigo_deck:1407823516967112795>",
  //   deck_value: "indigo_deck",
  //   deck_desc: "N/A",
  // },
];

export const stakes: readonly Stake[] = [
  {
    stake_name: "White Stake",
    stake_emote: "<:white_stake:1407754838108016733>",
    stake_value: "white_stake",
    stake_desc: "",
  },
  {
    stake_name: "Red Stake",
    stake_emote: "<:red_stake:1407754861944242196>",
    stake_value: "red_stake",
    stake_desc: "",
  },
  {
    stake_name: "Green Stake",
    stake_emote: "<:green_stake:1407754883506901063>",
    stake_value: "green_stake",
    stake_desc: "",
  },
  {
    stake_name: "Black Stake",
    stake_emote: "<:black_stake:1407754899470422129>",
    stake_value: "black_stake",
    stake_desc: "",
  },
  {
    stake_name: "Blue Stake",
    stake_emote: "<:blue_stake:1407754917535285450>",
    stake_value: "blue_stake",
    stake_desc: "",
  },
  {
    stake_name: "Purple Stake",
    stake_emote: "<:purple_stake:1407754932664270940>",
    stake_value: "purple_stake",
    stake_desc: "",
  },
  {
    stake_name: "Orange Stake",
    stake_emote: "<:orange_stake:1407754951626588273>",
    stake_value: "orange_stake",
    stake_desc: "",
  },
  {
    stake_name: "Gold Stake",
    stake_emote: "<:gold_stake:1407754971692404776>",
    stake_value: "gold_stake",
    stake_desc: "",
  },
];

export const customStakes: readonly Stake[] = [
  {
    stake_name: "",
    stake_emote: "",
    stake_value: "",
    stake_desc: "",
  },
];


export function getRandomDeck(includeCustomDecks: boolean = false): Deck {
  const randomDecks = [...decks];
  if (includeCustomDecks) randomDecks.push(...customDecks);
  return randomDecks[Math.floor(Math.random() * randomDecks.length)];
}

export function getRandomStake(includeCustomStakes: boolean = false): Stake {
  const randomStakes = [...stakes];
  if (includeCustomStakes) randomStakes.push(...customStakes);
  return randomStakes[Math.floor(Math.random() * randomStakes.length)];
}

export function setupDeckSelect(
    customId: string, 
    placeholderText: string, 
    minSelect: number, 
    maxSelect: number, 
    includeCustomDecks: boolean = false,
    bannedDecks: string[] = [],
    overrideDecks: string[] = []): ActionRowBuilder<StringSelectMenuBuilder> {
    let deckChoices = [...decks];
    if (includeCustomDecks) deckChoices.push(...customDecks);
    deckChoices = deckChoices.filter(deck => !bannedDecks.includes(deck.deck_value));
    
    if (overrideDecks.length > 0) {
      deckChoices = deckChoices.filter(deck => overrideDecks.includes(deck.deck_value));
    }

    const options: StringSelectMenuOptionBuilder[] = deckChoices.map((deck: Deck) => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(deck.deck_name)
            .setEmoji(deck.deck_emote)
            .setValue(deck.deck_value)
            .setDescription(deck.deck_desc)
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholderText)
        .addOptions(options)

    if (minSelect > 1) selectMenu.setMinValues(minSelect);
    if (maxSelect > 1) selectMenu.setMaxValues(maxSelect);

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    return selectRow;
}

export async function getTeamsInMatch(matchId: number): Promise<{ team: number, users: MatchUsers[], winRes: number }[]> {
  const matchUserRes: QueryResult<MatchUsers> = await pool.query(`
    SELECT * FROM match_users
    WHERE match_id = $1
  `, [matchId]);

  const queueId = await getQueueIdFromMatch(matchId);

  const queueUserRes = await Promise.all(matchUserRes.rows.map(async (matchUser: MatchUsers) => {
    return await pool.query(`
      SELECT * FROM queue_users
      WHERE user_id = $1 AND queue_id = $2
    `, [matchUser.user_id, queueId]);
  }));

  const userFull: MatchUsers[] = matchUserRes.rows.map((matchUser, i) => ({
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
    users: value.users as MatchUsers[],
    winRes: value.winRes,
  }));
}


export async function sendMatchInitMessages(queueId: number, matchId: number, textChannel: TextChannel) {

  const teamData = await getTeamsInMatch(matchId);
  // This is just for testing the layout, ^ the above does it properly
  // const teamData = [{ team: 1, users: [{user_id: '122568101995872256', elo: 250}] }, {team: 2, users: [{user_id: '122568101995872256', elo: 500}] }];
  const queueTeamSelectOptions: any[] = [];
  let teamPingString = ``;
  const queueName = await getQueueSettings(queueId, ['queue_name']);

  let teamFields: any[] = teamData.map(async (t: any, idx) => {

    let teamQueueUsersData = await pool.query(
      `SELECT * FROM queue_users
      WHERE user_id = ANY($1) AND queue_id = $2`,
      [t.users.map((u: any) => u.user_id), queueId])

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
    return { name: onePersonTeam ? `${onePersonTeamName}` : `Team ${t.team}`, value: teamString, inline: true, teamIndex: idx }
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
        .setTitle(`${queueName.queue_name} Match #${matchId}`)
        .setFields(teamFields)
        .setColor(0xFF0000);
     
  const randomTeams: any[] = _.shuffle(teamFields);

  const deckEmbed = new EmbedBuilder()
        .setTitle(`Deck Bans`)
        .setDescription(`**${randomTeams[0].name}** bans 5 decks.\n**${randomTeams[1].name}** chooses 3 decks.\n**${randomTeams[0].name}** picks 1 deck.\nVote using the dropdown below!\n\nAlternately, you can do </random-deck:1407756759057174560> and randomly pick one.`)
        .setColor(0xFF0000);

  const deckSelMenu = setupDeckSelect(`deck-bans-1-${matchId}-${randomTeams[1].teamIndex}`, `${randomTeams[0].name}: Select 5 decks to ban.`, 5, 5, true);

  await textChannel.send({ content: `# ${teamPingString}`, embeds: [eloEmbed], components: queueGameComponents });
  await textChannel.send({ embeds: [deckEmbed], components: [deckSelMenu] });
}

export async function endMatch(matchId: number): Promise<boolean> {

  // close match in DB
  await closeMatch(matchId);

  console.log('being closed')

  // delete match channel (faliure results in early return)
  const wasSuccessfullyDeleted = await deleteMatchChannel(matchId);
  if (!wasSuccessfullyDeleted) return false;

  // get log file using glob library 
  const pattern = path.join(__dirname, '..', 'logs', `match-${matchId}_*.log`).replace(/\\/g, '/');;
  const files = await glob(pattern)
  const file: string | null = files[0] ?? null;

  
  if (file) {
    // format and send transcript
    const logContent = fs.readFileSync(file, 'utf8');
    const logLines = logContent.split('\n').filter(line => line.trim() !== '');
    const parsedLogLines = await parseLogLines(logLines);
    console.log(parsedLogLines); // json body

    // delete the log file after transcript is sent 
    fs.unlinkSync(file);
  }
  


  // build rematch button row
  const rematchButtonRow: ActionRowBuilder<ButtonBuilder> = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rematch-${matchId}`).setLabel('Rematch').setEmoji('⚔️').setStyle(ButtonStyle.Primary)
  )

  const matchTeams = await getTeamsInMatch(matchId);
  const winningTeamId = await getWinningTeamFromMatch(matchId);
  if (!winningTeamId) { console.error(`No winning team found for match ${matchId}`); return false; }

  const queueId = await getQueueIdFromMatch(matchId);
  const queueName = await getQueueSettings(parseInt(queueId), ['queue_name']);
  const isGlicko = await isQueueGlicko(queueId);

  let teamResults: teamResults | null = null;
  if (isGlicko) {
    // create our teamResults object here
    const teamResultsData: teamResults = { 
      teams: matchTeams.map(teamResult => ({
        id: teamResult.team,
        score: teamResult.winRes as 0 | 0.5 | 1,
        players: teamResult.users as MatchUsers[]
      }))
    }
    
    teamResults = await calculateGlicko2(parseInt(queueId), matchId, teamResultsData);
  }

  // build results embed
  const resultsEmbed = new EmbedBuilder()
    .setTitle(`🏆 Winner For ${queueName.queue_name} Match #${matchId} 🏆`)
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
        return `<@${player.user_id}> *${player.elo_change && player.elo_change > 0 ? `+` : ``}${player.elo_change}* **(${player.elo})**`
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

  const resultsChannel = await getMatchResultsChannel();
  if (!resultsChannel) { console.error(`No results channel found for match ${matchId}`); return false; }

  await resultsChannel.send({ embeds: [resultsEmbed], components: [rematchButtonRow] });
  return true;
}

// delete match channel
export async function deleteMatchChannel(matchId: number): Promise<boolean> {
  const textChannel = await getMatchChannel(matchId);
  if (!textChannel) { 
    console.error(`No text channel found for match ${matchId}`); 
    return false;
  }
  await textChannel.delete().catch(err => {
    console.error(`Failed to delete text channel for match ${matchId}: ${err}`);
    return false;
  })
  return true
}
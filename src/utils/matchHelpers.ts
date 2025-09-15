import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from 'discord.js'
import { pool } from '../db'
import { shuffle } from 'lodash-es'
import {
  closeMatch,
  getDeckList,
  getDecksInQueue,
  getMatchChannel,
  getMatchResultsChannel,
  getQueueIdFromMatch,
  getQueueSettings,
  getStakeList,
  getUserQueueRole,
  getWinningTeamFromMatch,
  isQueueGlicko,
} from './queryDB'
import { Decks, MatchUsers, Stakes, teamResults } from 'psqlDB'
import dotenv from 'dotenv'
import { calculateGlicko2 } from './algorithms/calculateGlicko-2'
import { QueryResult } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import { parseLogLines } from './transcriptHelpers'
import { client } from '../client'

require('dotenv').config()

dotenv.config()

export async function getRandomDeck(includeCustomDecks: boolean = false): Promise<Decks> {
  const randomDecks = await getDeckList(includeCustomDecks);
  return randomDecks[Math.floor(Math.random() * randomDecks.length)]
}

export async function getRandomStake(includeCustomStakes: boolean = false): Promise<Stakes> {
  const randomStakes = await getStakeList(includeCustomStakes);
  return randomStakes[Math.floor(Math.random() * randomStakes.length)]
}

export async function setupDeckSelect(
  customId: string,
  placeholderText: string,
  minSelect: number,
  maxSelect: number,
  includeCustomDecks: boolean = false,
  bannedDecks: number[] = [],
  overrideDecks: number[] = [],
): Promise<ActionRowBuilder<StringSelectMenuBuilder>> {
  let deckChoices = await getDeckList(includeCustomDecks);
  deckChoices = deckChoices.filter(
    (deck) => !bannedDecks.includes(deck.id),
  )

  if (overrideDecks.length > 0) {
    deckChoices = deckChoices.filter((deck) =>
      overrideDecks.includes(deck.id),
    )
  }

  const options: StringSelectMenuOptionBuilder[] = deckChoices.map(
    (deck: Decks) => {
      return new StringSelectMenuOptionBuilder()
        .setLabel(deck.deck_name)
        .setEmoji(deck.deck_emote)
        .setValue(`${deck.id}`)
        .setDescription(deck.deck_desc)
    },
  )

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholderText)
    .addOptions(options)

  if (minSelect > 1) selectMenu.setMinValues(minSelect)
  if (maxSelect > 1) selectMenu.setMaxValues(maxSelect)

  const selectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)

  return selectRow
}

export async function getTeamsInMatch(
  matchId: number,
): Promise<{ team: number; users: MatchUsers[]; winRes: number }[]> {
  const matchUserRes: QueryResult<MatchUsers> = await pool.query(
    `
    SELECT * FROM match_users
    WHERE match_id = $1
  `,
    [matchId],
  )

  const queueId = await getQueueIdFromMatch(matchId)

  const queueUserRes = await Promise.all(
    matchUserRes.rows.map(async (matchUser: MatchUsers) => {
      return await pool.query(
        `
      SELECT * FROM queue_users
      WHERE user_id = $1 AND queue_id = $2
    `,
        [matchUser.user_id, queueId],
      )
    }),
  )

  const userFull: MatchUsers[] = matchUserRes.rows.map((matchUser, i) => ({
    ...queueUserRes[i].rows[0], // properties from queue_users
    ...matchUser, // properties from match_users
  }))

  // return winning team id
  const winningTeamId = await getWinningTeamFromMatch(matchId)

  // if there is no matchUser instance then early return
  if (matchUserRes.rowCount === 0) return []

  type teamGroupType = { [key: number]: { users: any[]; winRes: number } }
  const teamGroups: teamGroupType = {}

  for (const user of userFull) {
    if (user.team === null) continue

    if (!teamGroups[user.team]) {
      teamGroups[user.team] = { users: [], winRes: 0 }
    }
    teamGroups[user.team].users.push(user)
    teamGroups[user.team].winRes = user.team === winningTeamId ? 1 : 0
  }

  return Object.entries(teamGroups).map(([team, value]) => ({
    team: Number(team),
    users: value.users as MatchUsers[],
    winRes: value.winRes,
  }))
}

export async function sendMatchInitMessages(
  queueId: number,
  matchId: number,
  textChannel: TextChannel,
) {
  const teamData = await getTeamsInMatch(matchId)
  // This is just for testing the layout, ^ the above does it properly
  // const teamData = [{ team: 1, users: [{user_id: '122568101995872256', elo: 250}] }, {team: 2, users: [{user_id: '122568101995872256', elo: 500}] }];
  const queueTeamSelectOptions: any[] = []
  let teamPingString = ``
  const queueName = await getQueueSettings(queueId, ['queue_name'])

  let teamFields: any[] = teamData.map(async (t: any, idx) => {
    let teamQueueUsersData = await pool.query(
      `SELECT * FROM queue_users
      WHERE user_id = ANY($1) AND queue_id = $2`,
      [t.users.map((u: any) => u.user_id), queueId],
    )

    let teamString = ``
    let onePersonTeam = false
    let onePersonTeamName

    if (teamQueueUsersData.rowCount == 0) return
    if (teamQueueUsersData.rowCount == 1) onePersonTeam = true

    for (const user of teamQueueUsersData.rows) {
      let userDiscordInfo = await client.users.fetch(user.user_id)
      teamPingString += `<@${user.user_id}> `

      if (onePersonTeam) {
        teamString += `\`${user.elo} MMR\`\n`
        onePersonTeamName = userDiscordInfo.displayName
      } else {
        teamString += `**${userDiscordInfo.displayName}** - ${user.elo}\n`
      }
    }

    queueTeamSelectOptions.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(
          onePersonTeam == true ? `${onePersonTeamName}` : `Team ${t.team}`,
        )
        .setDescription(
          `Select ${onePersonTeam == true ? `${onePersonTeamName}` : `team ${t.team}`} as the winner.`,
        )
        .setValue(`winmatch_${matchId}_${t.team}`),
    )

    teamPingString += 'vs. '
    return {
      name: onePersonTeam ? `${onePersonTeamName}` : `Team ${t.team}`,
      value: teamString,
      inline: true,
      teamIndex: idx,
    }
  })

  teamFields = await Promise.all(teamFields)
  const queueGameComponents: any[] = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('match_winner')
        .setPlaceholder('Select the game winner!')
        .setOptions(queueTeamSelectOptions),
    ),
  ]

  // Slice off the last vs.
  teamPingString = teamPingString.slice(0, -4)

  queueGameComponents.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cancel-${matchId}`)
        .setLabel('Cancel Match')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`call-helpers-${matchId}`)
        .setLabel('Call Helpers')
        .setStyle(ButtonStyle.Secondary),
    ),
  )

  const eloEmbed = new EmbedBuilder()
    .setTitle(`${queueName.queue_name} Match #${matchId}`)
    .setFields(teamFields)
    .setColor(0xff0000)

  const randomTeams: any[] = shuffle(teamFields)

  const deckEmbed = new EmbedBuilder()
    .setTitle(`Deck Bans`)
    .setDescription(
      `**${randomTeams[0].name}** bans 5 decks.\n**${randomTeams[1].name}** chooses 3 decks.\n**${randomTeams[0].name}** picks 1 deck.\nVote using the dropdown below!\n\nAlternately, you can do </random deck:1414248501742669937> and randomly pick one.`,
    )
    .setColor(0xff0000)

  const deckList = await getDecksInQueue(queueId);

  const deckSelMenu = await setupDeckSelect(
    `deck-bans-1-${matchId}-${randomTeams[1].teamIndex}`,
    `${randomTeams[0].name}: Select 5 decks to ban.`,
    5,
    5,
    true,
    [],
    deckList.map(deck => deck.id),
  )

  await textChannel.send({
    content: `# ${teamPingString}`,
    embeds: [eloEmbed],
    components: queueGameComponents,
  })
  await textChannel.send({ embeds: [deckEmbed], components: [deckSelMenu] })
}

export async function endMatch(
  matchId: number,
  cancelled = false,
): Promise<boolean> {
  try {
    // close match in DB
    console.log(`Closing match: ${matchId}`)
    await closeMatch(matchId)

    // get log file using glob library
    const pattern = path
      .join(__dirname, '..', 'logs', `match-${matchId}_*.log`)
      .replace(/\\/g, '/')
    const files = await glob(pattern)
    const file: string | null = files[0] ?? null

    if (file) {
      // format and send transcript
      const logContent = fs.readFileSync(file, 'utf8')
      const logLines = logContent
        .split('\n')
        .filter((line) => line.trim() !== '')
      const parsedLogLines = await parseLogLines(logLines)
      console.log(parsedLogLines) // json body

      // delete the log file after transcript is sent
      fs.unlinkSync(file)
    }

    // delete match channel (faliure results in early return)
    const wasSuccessfullyDeleted = await deleteMatchChannel(matchId)
    if (!wasSuccessfullyDeleted) {
      console.error(`Failed to delete match channel for match ${matchId}`)
      return false
    }

    if (cancelled) return true
  } catch (err) {
    console.error(
      `Error in file formatting or channel deletion for match ${matchId}:`,
      err,
    )
    return false
  }

  // build rematch button row
  const rematchButtonRow: ActionRowBuilder<ButtonBuilder> =
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rematch-${matchId}`)
        .setLabel('Rematch')
        .setEmoji('⚔️')
        .setStyle(ButtonStyle.Primary),
    )

  const matchTeams = await getTeamsInMatch(matchId)
  const winningTeamId = await getWinningTeamFromMatch(matchId)
  if (!winningTeamId) {
    console.error(`No winning team found for match ${matchId}`)
    return false
  }

  const queueId = await getQueueIdFromMatch(matchId)
  const queueName = await getQueueSettings(queueId, ['queue_name'])
  const isGlicko = await isQueueGlicko(queueId)

  let teamResults: teamResults | null = null
  if (isGlicko) {
    // create our teamResults object here
    const teamResultsData: teamResults = {
      teams: matchTeams.map((teamResult) => ({
        id: teamResult.team,
        score: teamResult.winRes as 0 | 0.5 | 1,
        players: teamResult.users as MatchUsers[],
      })),
    }

    teamResults = await calculateGlicko2(
      queueId,
      matchId,
      teamResultsData,
    )
  }

  // build results embed
  const resultsEmbed = new EmbedBuilder()
    .setTitle(`🏆 Winner For ${queueName.queue_name} Match #${matchId} 🏆`)
    .setColor('Gold')

  // running for every team then combining at the end
  const embedFields = await Promise.all(
    (teamResults?.teams ?? []).map(async (team) => {
      const playerList = await Promise.all(
        team.players.map((player) => client.users.fetch(player.user_id)),
      )
      const playerNameList = playerList.map((user) => user.displayName)

      // show name for every player in team
      const label =
        team.score === 1
          ? `__${playerNameList.join('\n')}__`
          : `${playerNameList.join('\n')}`

      // show id, elo change, new elo for every player in team
      const description = team.players
        .map((player) => {
          return `<@${player.user_id}> *${player.elo_change && player.elo_change > 0 ? `+` : ``}${player.elo_change}* **(${player.elo})**`
        })
        .join('\n')

      // return array of objects to embedFields
      return {
        isWinningTeam: team.score === 1,
        label,
        description,
      }
    }),
  )

  // initialize arrays to hold fields
  const winUserLabels: string[] = []
  const winUserDescs: string[] = []
  const lossUserLabels: string[] = []
  const lossUserDescs: string[] = []

  // separate winning and losing teams
  for (const field of embedFields) {
    if (field.isWinningTeam) {
      winUserLabels.push(field.label)
      winUserDescs.push(field.description)
    } else {
      lossUserLabels.push(field.label)
      lossUserDescs.push(field.description)
    }
  }

  resultsEmbed.addFields(
    {
      name: winUserLabels.join(' / '),
      value: winUserDescs.join('\n'),
      inline: true,
    },
    {
      name: lossUserLabels.join(' / '),
      value: lossUserDescs.join('\n'),
      inline: true,
    },
  )

  const resultsChannel = await getMatchResultsChannel()
  if (!resultsChannel) {
    console.error(`No results channel found for match ${matchId}`)
    return false
  }

  await resultsChannel.send({
    embeds: [resultsEmbed],
    components: [rematchButtonRow],
  })
  return true
}

// delete match channel
export async function deleteMatchChannel(matchId: number): Promise<boolean> {
  const textChannel = await getMatchChannel(matchId)
  if (!textChannel) {
    console.error(`No text channel found for match ${matchId}`)
    return false
  }
  setTimeout(async () => {
    await textChannel.delete().catch((err) => {
      console.error(
        `Failed to delete text channel for match ${matchId}: ${err}`,
      )
      return false
    })
  }, 1000)
  return true
}

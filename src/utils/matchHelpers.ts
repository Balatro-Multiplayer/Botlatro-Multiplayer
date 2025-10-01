import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
  VoiceChannel,
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
  getWinningTeamFromMatch,
  isQueueGlicko,
  setMatchStakeVoteTeam,
  setMatchVoiceChannel,
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

export async function getRandomDeck(
  includeCustomDecks: boolean = false,
): Promise<Decks> {
  const randomDecks = await getDeckList(includeCustomDecks)
  return randomDecks[Math.floor(Math.random() * randomDecks.length)]
}

export async function getRandomStake(
  includeCustomStakes: boolean = false,
): Promise<Stakes> {
  const randomStakes = await getStakeList(includeCustomStakes)
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
  let deckChoices = await getDeckList(includeCustomDecks)
  deckChoices = deckChoices.filter((deck) => !bannedDecks.includes(deck.id))

  if (overrideDecks.length > 0) {
    deckChoices = deckChoices.filter((deck) => overrideDecks.includes(deck.id))
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

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu,
  )
}

export async function setupStakeButtons(
  matchId: number,
): Promise<ActionRowBuilder<ButtonBuilder>[]> {
  const stakeRow: ActionRowBuilder<ButtonBuilder> = new ActionRowBuilder()
  const vetoRow: ActionRowBuilder<ButtonBuilder> = new ActionRowBuilder()
  let stakeList = await getStakeList()
  // TODO: Make this queue dependent, maybe
  stakeList = stakeList.filter(
    (stake) =>
      stake.stake_name !== 'Red Stake' &&
      stake.stake_name !== 'Blue Stake' &&
      stake.stake_name !== 'Orange Stake',
  )

  if (stakeList.length < 5)
    throw new Error('Not enough stakes to do stake bans.')

  const whiteStake =
    stakeList.find((stake) => stake.stake_name == 'White Stake') ?? stakeList[0]
  const greenStake =
    stakeList.find((stake) => stake.stake_name == 'Green Stake') ?? stakeList[1]
  const blackStake =
    stakeList.find((stake) => stake.stake_name == 'Black Stake') ?? stakeList[2]
  const purpleStake =
    stakeList.find((stake) => stake.stake_name == 'Purple Stake') ??
    stakeList[3]
  const goldStake =
    stakeList.find((stake) => stake.stake_name == 'Gold Stake') ?? stakeList[4]

  stakeRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`stake-${whiteStake.id}-0-${matchId}`)
      .setEmoji(whiteStake.stake_emote)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stake-${greenStake.id}-1-${matchId}`)
      .setEmoji(greenStake.stake_emote)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stake-${blackStake.id}-2-${matchId}`)
      .setEmoji(blackStake.stake_emote)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stake-${purpleStake.id}-3-${matchId}`)
      .setEmoji(purpleStake.stake_emote)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stake-${goldStake.id}-4-${matchId}`)
      .setEmoji(goldStake.stake_emote)
      .setStyle(ButtonStyle.Success),
  )

  vetoRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`veto-stake`)
      .setLabel(`VETO`)
      .setStyle(ButtonStyle.Danger),
  )

  return [stakeRow, vetoRow]
}

export async function getTeamsInMatch(matchId: number): Promise<teamResults> {
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
  if (matchUserRes.rowCount === 0) return { teams: [] }

  type teamGroupType = { [key: number]: { users: any[]; score: number } }
  const teamGroups: teamGroupType = {}

  for (const user of userFull) {
    if (user.team === null) continue

    if (!teamGroups[user.team]) {
      teamGroups[user.team] = { users: [], score: 0 }
    }
    teamGroups[user.team].users.push(user)
    teamGroups[user.team].score = user.team === winningTeamId ? 1 : 0
  }

  return {
    teams: Object.entries(teamGroups).map(([team, value]) => ({
      id: Number(team),
      players: value.users as MatchUsers[],
      score: value.score,
    })),
  }
}

export async function sendMatchInitMessages(
  queueId: number,
  matchId: number,
  textChannel: TextChannel,
) {
  const teamData = await getTeamsInMatch(matchId)
  const queueTeamSelectOptions: StringSelectMenuOptionBuilder[] = []
  let teamPingString = ``
  const queueSettings = await getQueueSettings(queueId)

  let teamFields: any = teamData.teams.map(async (t, idx) => {
    let teamQueueUsersData = await pool.query(
      `SELECT * FROM queue_users
      WHERE user_id = ANY($1) AND queue_id = $2`,
      [t.players.map((u) => u.user_id), queueId],
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
        teamString += `**${userDiscordInfo.displayName}** - ${user.elo} MMR\n`
      }
    }

    queueTeamSelectOptions.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(onePersonTeam ? `${onePersonTeamName}` : `Team ${t.id}`)
        .setDescription(
          `Select ${onePersonTeam ? `${onePersonTeamName}` : `team ${t.id}`} as the winner.`,
        )
        .setValue(`winmatch_${matchId}_${t.id}`),
    )

    teamPingString += 'vs. '
    return {
      name: onePersonTeam ? `${onePersonTeamName}` : `Team ${t.id}`,
      players: t.players,
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

  const eloEmbed = new EmbedBuilder()
    .setTitle(`${queueSettings.queue_name} Match #${matchId}`)
    .setFields(teamFields)
    .setColor(0xff0000)

  eloEmbed.addFields({ name: 'Cancel Match Votes:', value: '-' })

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cancel-${matchId}`)
      .setLabel('Cancel Match')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`call-helpers-${matchId}`)
      .setLabel('Call Helpers')
      .setStyle(ButtonStyle.Primary),
  ) as ActionRowBuilder<ButtonBuilder>

  if (queueSettings.best_of_allowed) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`bo-vote-3-${matchId}`)
        .setLabel('Vote BO3')
        .setStyle(ButtonStyle.Success),
    )
  }

  queueGameComponents.push(actionRow)

  const randomTeams: any[] = shuffle(teamFields)

  const deckEmbed = new EmbedBuilder()
    .setTitle(`Deck Bans`)
    .setDescription(
      `**${randomTeams[0].name}** bans 5 decks.\n**${randomTeams[1].name}** chooses 3 decks.\n**${randomTeams[0].name}** picks 1 deck.\nVote using the dropdown below!\n\nAlternately, you can do </random deck:1414248501742669937> and randomly pick one.`,
    )
    .setColor(0xff0000)

  const deckList = await getDecksInQueue(queueId)

  const deckSelMenu = await setupDeckSelect(
    `deck-bans-1-${matchId}-${randomTeams[1].teamIndex}`,
    `${randomTeams[0].name}: Select 5 decks to ban.`,
    5,
    5,
    true,
    [],
    deckList.map((deck) => deck.id),
  )

  await setMatchStakeVoteTeam(matchId, randomTeams[0].teamIndex)
  const stakeBanButtons = await setupStakeButtons(matchId)
  const teamUsers = randomTeams[0].players
    .map((user: MatchUsers) => `<@${user.user_id}>`)
    .join('\n')

  await textChannel.send({
    content: `# ${teamPingString}`,
    embeds: [eloEmbed],
    components: queueGameComponents,
  })
  await textChannel.send({ embeds: [deckEmbed], components: [deckSelMenu] })
  await textChannel.send({
    content: `Stake Bans:\n${teamUsers}`,
    components: stakeBanButtons,
  })
}

export async function setMatchWinner(
  interaction: any,
  matchId: number,
  winningTeam: number,
) {
  await pool.query(`UPDATE matches SET winning_team = $1 WHERE id = $2`, [
    winningTeam,
    matchId,
  ])
  await endMatch(matchId)
  await interaction.update({
    content: 'The match has ended!',
    embeds: [],
    components: [],
  })
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
      teams: matchTeams.teams.map((teamResult) => ({
        id: teamResult.id,
        score: teamResult.score as 0 | 0.5 | 1,
        players: teamResult.players as MatchUsers[],
      })),
    }

    teamResults = await calculateGlicko2(queueId, matchId, teamResultsData)
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

// Setup match vc
export async function setupMatchVoiceChannel(
  interaction: any,
  matchId: number,
): Promise<VoiceChannel> {
  const matchUsers = await getTeamsInMatch(matchId)
  const matchUsersArray = matchUsers.teams.flatMap((t) =>
    t.players.map((u) => u.user_id),
  )
  const channel: any = interaction.message.channel
  const category = channel?.parent

  const voiceChannel = (await interaction.guild?.channels.create({
    name: `Match #${matchId}`,
    type: ChannelType.GuildVoice,
    parent: category,
    permissionOverwrites: [
      {
        id: interaction.guild?.roles.everyone.id,
        deny: [PermissionsBitField.Flags.Connect],
      },
      ...matchUsersArray.map((userId) => ({
        id: userId,
        allow: [
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.ViewChannel,
        ],
      })),
    ],
  })) as VoiceChannel

  await setMatchVoiceChannel(matchId, voiceChannel.id)

  return voiceChannel
}

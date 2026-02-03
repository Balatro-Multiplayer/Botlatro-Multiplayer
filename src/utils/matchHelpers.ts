import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
  VoiceChannel,
} from 'discord.js'
import { pool } from '../db'
import { shuffle } from 'lodash-es'
import {
  closeMatch,
  getActiveMatches,
  getDeckByName,
  getDeckList,
  getDecksInQueue,
  getMatchChannel,
  getMatchData,
  getMatchQueueLogMessageId,
  getMatchResultsChannel,
  getMatchResultsMessageId,
  getMatchStatus,
  getQueueIdFromMatch,
  getQueueSettings,
  getSettings,
  getStakeByName,
  getStakeList,
  getUserDefaultDeckBans,
  getUserQueueRole,
  getWinningTeamFromMatch,
  setMatchResultsMessageId,
  setMatchStakeVoteTeam,
  setMatchVoiceChannel,
  setPickedMatchDeck,
  updatePlayerWinStreak,
} from './queryDB'
import { Decks, MatchUsers, Stakes, teamResults } from 'psqlDB'
import dotenv from 'dotenv'
import { QueryResult } from 'pg' // import * as fs from 'fs'
// import * as path from 'path'
// import { glob } from 'glob'
// import { parseLogLines } from './transcriptHelpers'
import { client, getGuild } from '../client'
import {
  calculateNewMMR,
  calculatePredictedMMR,
} from './algorithms/calculateMMR'
import {
  clearChannelMessageCount,
  setLastWinVoteMessage,
} from '../events/messageCreate'

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

/**
 * Advances the deck ban/pick process to the next step
 * @param deckChoices - Array of deck IDs chosen in the current step
 * @param step - Current step (1, 2, or 3)
 * @param matchId - Match ID
 * @param startingTeamId - The team that started the banning process
 * @param channel - Text channel to send messages to
 */
export async function advanceDeckBanStep(
  deckChoices: number[],
  step: number,
  matchId: number,
  startingTeamId: number,
  channel: TextChannel,
): Promise<void> {
  const queueId = await getQueueIdFromMatch(matchId)
  const matchTeams = await getTeamsInMatch(matchId)
  const deckOptions = await getDecksInQueue(queueId)
  const queueSettings = await getQueueSettings(queueId)
  const step2Amt = queueSettings.second_deck_ban_num

  // Handle final deck pick (step 3)
  if (step === 3) {
    const finalDeckPick = deckOptions.find((deck) =>
      deckChoices.includes(deck.id),
    )

    if (finalDeckPick) {
      await setPickedMatchDeck(matchId, finalDeckPick.deck_name, true)
      await channel.send({
        content: `## Selected Deck: ${finalDeckPick.deck_emote} ${finalDeckPick.deck_name}`,
      })
    }
    return
  }

  // Prepare next step
  const nextStep = step + 1
  const nextTeamId = (startingTeamId + nextStep) % 2
  const nextMember = await client.guilds
    .fetch(process.env.GUILD_ID!)
    .then((g) =>
      g.members.fetch(matchTeams.teams[nextTeamId].players[0].user_id),
    )

  const deckSelMenu = await setupDeckSelect(
    `deck-bans-${nextStep}-${matchId}-${startingTeamId}`,
    matchTeams.teams[nextTeamId].players.length > 1
      ? `Team ${matchTeams.teams[nextTeamId].id}: Select ${nextStep === 2 ? step2Amt : 1} decks to play.`
      : `${nextMember.displayName}: Select ${nextStep === 2 ? step2Amt : 1} decks to play.`,
    nextStep === 2 ? step2Amt : 1,
    nextStep === 2 ? step2Amt : 1,
    true,
    nextStep === 3 ? [] : deckChoices,
    nextStep === 3 ? deckChoices : deckOptions.map((deck) => deck.id),
  )

  const deckPicks = deckOptions
    .filter((deck) => deckChoices.includes(deck.id))
    .map((deck) => `${deck.deck_emote} - ${deck.deck_name}`)

  await channel.send({
    content: `<@${matchTeams.teams[nextTeamId].players[0].user_id}>\n### ${step == 1 ? `Banned Decks:\n` : `Decks Picked:\n`}${deckPicks.join('\n')}`,
    components: [deckSelMenu],
  })
}

/**
 * Applies a user's saved default deck bans and advances to the next step
 * Returns the deck IDs that were banned, or null if user has no saved bans
 */
export async function applyDefaultDeckBansAndAdvance(
  userId: string,
  matchId: number,
  step: number,
  startingTeamId: number,
  channel: TextChannel,
): Promise<number[] | null> {
  const queueId = await getQueueIdFromMatch(matchId)
  const userDefaultBans = await getUserDefaultDeckBans(userId, queueId)

  if (userDefaultBans.length === 0) {
    return null
  }

  await advanceDeckBanStep(
    userDefaultBans,
    step,
    matchId,
    startingTeamId,
    channel,
  )

  return userDefaultBans
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

  if (stakeList.length < 5) console.error('Not enough stakes to do stake bans.')

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
  const queueSettings = await getQueueSettings(queueId)
  const deckBanFirstNum = queueSettings.first_deck_ban_num
  const deckBanSecondNum = queueSettings.second_deck_ban_num

  // Build team ping string for initial message
  let teamPingString = ``
  let disabilityUser = false
  for (const team of teamData.teams) {
    for (const player of team.players) {
      teamPingString += `<@${player.user_id}> `
      // Specific handling for disability users
      if (
        player.user_id == '366416883454443520' ||
        player.user_id == '621234251215405066'
      ) {
        disabilityUser = true
      }
    }
    teamPingString += 'vs. '
  }
  teamPingString = teamPingString.slice(0, -4)

  // Get team fields for deck/stake setup
  let teamFields: any = teamData.teams.map(async (t, idx) => {
    let teamQueueUsersData = await pool.query(
      `SELECT * FROM queue_users
      WHERE user_id = ANY($1) AND queue_id = $2`,
      [t.players.map((u) => u.user_id), queueId],
    )

    let onePersonTeam = teamQueueUsersData.rowCount === 1
    let onePersonTeamName

    if (teamQueueUsersData.rowCount == 0) return

    for (const user of teamQueueUsersData.rows) {
      let userDiscordInfo = await client.users.fetch(user.user_id)
      if (onePersonTeam) {
        onePersonTeamName = userDiscordInfo.displayName
      }
    }

    return {
      name: onePersonTeam ? `${onePersonTeamName}` : `Team ${t.id}`,
      players: t.players,
      teamIndex: idx,
    }
  })
  teamFields = await Promise.all(teamFields)

  // Send the win vote message using the shared function
  const messageId = await resendMatchWinVote(
    matchId,
    textChannel,
    teamPingString,
  )
  if (messageId) {
    setLastWinVoteMessage(textChannel.id, messageId)
  }

  const randomTeams: any[] = shuffle(teamFields)

  const deckEmbed = new EmbedBuilder()
    .setTitle(`Deck Bans`)
    .setDescription(
      `**${randomTeams[0].name}** bans up to ${deckBanFirstNum} decks.\n**${randomTeams[1].name}** chooses ${deckBanSecondNum} decks.\n**${randomTeams[0].name}** picks 1 deck.\nVote using the dropdown below!\n\nAlternately, you can do </random deck:1425693398609825877> and randomly pick one.`,
    )
    .setColor(0xff0000)

  const deckList = await getDecksInQueue(queueId)

  const deckSelMenu = await setupDeckSelect(
    `deck-bans-1-${matchId}-${randomTeams[1].teamIndex}`,
    `${randomTeams[0].name}: Select up to ${deckBanFirstNum} decks to ban.`,
    1,
    deckBanFirstNum,
    true,
    [],
    deckList.map((deck) => deck.id),
  )

  const useDefaultBansButton =
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `use-default-bans-1-${matchId}-${randomTeams[1].teamIndex}`,
        )
        .setLabel('Use Preset Bans')
        .setStyle(ButtonStyle.Primary),
    )

  await setMatchStakeVoteTeam(matchId, randomTeams[0].teamIndex)
  const stakeBanButtons = await setupStakeButtons(matchId)
  const teamUsers = randomTeams[0].players
    .map((user: MatchUsers) => `<@${user.user_id}>`)
    .join('\n')

  await textChannel.send({
    embeds: [deckEmbed],
    components: [deckSelMenu, useDefaultBansButton],
  })
  await textChannel.send({
    content: `**Stake Bans:**\n${teamUsers}`,
    components: stakeBanButtons,
  })

  // Send special disability message
  if (disabilityUser) {
    await textChannel.send({
      content:
        `This match includes a user that has an official exemption from certain ranked rules due to health reasons. ` +
        `This game boths player will not be allowed to use the timer, and will not be allowed ` +
        `to purchase or use Conjoined Joker (agreeing to the rules and then intentionally breaking them will be seen as a forfeit).\n\n` +
        `If you agree with these rules, please type **"I agree"** before the match is started.\n` +
        `If you do not want to play by these rules you are free to say **"I disagree"** and vote to cancel the match. Please be respectful.`,
    })
  }
}

export async function resendMatchWinVote(
  matchId: number,
  textChannel: TextChannel,
  initialPingString?: string,
  lastMessageId?: string,
): Promise<string | null> {
  const queueId = await getQueueIdFromMatch(matchId)
  const teamData = await getTeamsInMatch(matchId)
  const queueTeamSelectOptions: StringSelectMenuOptionBuilder[] = []
  const queueSettings = await getQueueSettings(queueId)

  // Calculate predicted MMR changes for each team winning
  const teamPredictions = new Map<number, Map<string, number>>()
  for (const team of teamData.teams) {
    const predictions = await calculatePredictedMMR(queueId, teamData, team.id)
    teamPredictions.set(team.id, predictions)
  }

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

    // Get predictions for this team winning
    const predictions = teamPredictions.get(t.id)

    for (const user of teamQueueUsersData.rows) {
      let userDiscordInfo = await client.users.fetch(user.user_id)
      const predictedChange = predictions?.get(user.user_id) ?? 0
      const changeStr =
        predictedChange > 0 ? `+${predictedChange}` : `${predictedChange}`

      const queueRole = await getUserQueueRole(queueId, user.user_id)

      if (onePersonTeam) {
        teamString += `\`${user.elo} MMR (${changeStr})\`\n`
        if (queueRole && queueRole.emote) {
          onePersonTeamName = `${userDiscordInfo.displayName}`
        } else {
          onePersonTeamName = userDiscordInfo.displayName
        }
      } else {
        teamString += `**${userDiscordInfo.displayName}** - ${user.elo} MMR **(${changeStr})**\n`
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

  const eloEmbed = new EmbedBuilder()
    .setTitle(`${queueSettings.queue_name} Match #${matchId}`)
    .setFields(teamFields)
    .setColor(0xff0000)

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

  // Try to fetch and preserve the old message's embed if it exists
  let embedToUse = eloEmbed
  if (lastMessageId) {
    try {
      const oldMessage = await textChannel.messages.fetch(lastMessageId)
      // Preserve the old embed with votes
      if (oldMessage.embeds.length > 0) {
        embedToUse = EmbedBuilder.from(oldMessage.embeds[0])
      }
      await oldMessage.delete()
    } catch (err) {
      // Message might already be deleted, ignore error and use new embed
    }
  }

  // Use initial ping string if provided (first message)
  const messageContent = initialPingString ? `# ${initialPingString}` : ` `

  const sentMessage = await textChannel.send({
    content: messageContent,
    embeds: [embedToUse],
    components: queueGameComponents,
  })

  return sentMessage.id
}

// Updates the queue log message when a match is complete with match info
export async function updateQueueLogMessage(
  matchId: number,
  queueId: number,
  teamResults: teamResults,
  cancelled: boolean = false,
): Promise<void> {
  try {
    // Get the queue log message ID
    const queueLogMsgId = await getMatchQueueLogMessageId(matchId)
    if (!queueLogMsgId) {
      console.log(`No queue log message found for match ${matchId}`)
      return
    }

    const settings = await getSettings()
    const queueLogsChannelId = settings.queue_logs_channel_id
    if (!queueLogsChannelId) {
      console.log('No queue logs channel configured')
      return
    }

    const queueLogsChannel = await client.channels.fetch(queueLogsChannelId)
    if (!queueLogsChannel || !queueLogsChannel.isTextBased()) {
      console.log('Queue logs channel not found or not text-based')
      return
    }

    const queueLogMsg = await queueLogsChannel.messages.fetch(queueLogMsgId)
    if (!queueLogMsg) {
      console.log(`Queue log message ${queueLogMsgId} not found`)
      return
    }

    // Get queue settings
    const queueSettings = await getQueueSettings(queueId)
    const winningTeamId = await getWinningTeamFromMatch(matchId)

    const logFields = []

    // Match ID field
    logFields.push({
      name: 'Match ID',
      value: `#${matchId}`,
      inline: true,
    })

    // Queue field
    logFields.push({
      name: 'Queue',
      value: queueSettings.queue_name,
      inline: true,
    })

    // Status field
    logFields.push({
      name: 'Status',
      value: cancelled ? 'Cancelled' : 'Finished',
      inline: true,
    })

    // Winner field
    if (!cancelled) {
      const winningTeam = teamResults.teams.find((t) => t.id === winningTeamId)
      if (winningTeam) {
        let winnerLabel = `Team ${winningTeam.id}`
        if (winningTeam.players.length === 1) {
          try {
            winnerLabel = `<@${winningTeam.players[0].user_id}>`
          } catch (err) {
            // Do nothing
          }
        }
        logFields.push({
          name: 'Winner',
          value: winnerLabel,
          inline: true,
        })
      }
    }

    // Players and MMR changes field
    const playerLines: string[] = []
    for (const team of teamResults.teams) {
      for (const player of team.players) {
        const eloChange = player.elo_change ?? 0
        const changeStr = eloChange > 0 ? `+${eloChange}` : `${eloChange}`
        const winnerEmoji = team.id === winningTeamId ? '🏆 ' : ''
        playerLines.push(`${winnerEmoji}<@${player.user_id}>: ${changeStr} MMR`)
      }
    }

    logFields.push({
      name: 'Results',
      value: playerLines.join('\n'),
      inline: false,
    })

    // create transcript button and add to embed
    const leaderboardBtn = new ButtonBuilder()
      .setLabel('View Transcripts')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://balatromp.com/transcript/${matchId}`)

    const transcriptRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      leaderboardBtn,
    )

    const updatedEmbed = EmbedBuilder.from(queueLogMsg.embeds[0])
      .setFields(logFields)
      .setColor(cancelled ? '#ff0000' : '#2ECD71')

    // add action row
    const components = [...(queueLogMsg.components ?? []), transcriptRow]

    await queueLogMsg.edit({
      embeds: [updatedEmbed],
      components,
    })

    console.log(`Updated queue log message for match ${matchId}`)
  } catch (err) {
    console.error(
      `Failed to update queue log message for match ${matchId}:`,
      err,
    )
  }
}

export async function endMatch(
  matchId: number,
  cancelled = false,
): Promise<boolean> {
  console.log(`Attempting to close match ${matchId}`)

  const matchCheck = await getMatchStatus(matchId)
  if (!matchCheck) {
    console.log(`match ${matchId} already closed, running change winner logic`)
  }

  await closeMatch(matchId)
  console.log(`Ending match ${matchId}, cancelled: ${cancelled}`)

  // Get teams early so we can use for both cancelled and completed matches
  const matchTeams = await getTeamsInMatch(matchId)
  const queueId = await getQueueIdFromMatch(matchId)

  // Capture channel info before it gets deleted (needed for transcript file path) - only run if match hasn't been closed yet
  if (matchCheck) {
    var matchChannel = await getMatchChannel(matchId)
    var matchChannelName = matchChannel?.name ?? null
    var matchChannelId = matchChannel?.id ?? null
  }

  if (cancelled) {
    console.log(`Match ${matchId} cancelled.`)
    const wasSuccessfullyDeleted = await deleteMatchChannel(matchId).catch(
      () => null,
    )
    if (!wasSuccessfullyDeleted) {
      console.log(`Channel id not found / failed to delete match ${matchId}`)
    }

    // Update queue log message for cancelled match
    try {
      await updateQueueLogMessage(matchId, queueId, matchTeams, true)
    } catch (err) {
      console.error(
        `Failed to update queue log message for match ${matchId}:`,
        err,
      )
    }

    return true
  }

  const winningTeamId = await getWinningTeamFromMatch(matchId)
  if (!winningTeamId) {
    console.error(`No winning team found for match ${matchId}`)
    return false
  }

  console.log(`Queue ID for match ${matchId}: ${queueId}`)
  const queueSettings = await getQueueSettings(queueId)
  console.log(`Queue settings for match ${matchId}:`, queueSettings)
  const matchData = await getMatchData(matchId)
  console.log(`Match data for match ${matchId}:`, matchData)

  let teamResults: teamResults | null
  // create our teamResults object here
  const teamResultsData: teamResults = {
    teams: matchTeams.teams.map((teamResult) => ({
      id: teamResult.id,
      score: teamResult.score as 0 | 0.5 | 1,
      players: teamResult.players as MatchUsers[],
    })),
  }

  console.log(`match ${matchId} team results made`)

  teamResults = await calculateNewMMR(
    queueId,
    queueSettings,
    teamResultsData,
    winningTeamId,
  )

  console.log(`match ${matchId} results: ${teamResults.teams}`)

  // Save elo_change, mmr_after, and winstreak to database
  const updatePromises = teamResults.teams.flatMap((team) =>
    team.players.map(async (player) => {
      console.log(
        `Team ${team.id} player ${player.user_id} in match ${matchId}`,
      )
      // Update win streak
      await updatePlayerWinStreak(player.user_id, queueId, team.score == 1)

      // Update elo change and mmr_after if they exist
      if (player.elo_change !== undefined && player.elo_change !== null) {
        await pool.query(
          `UPDATE match_users SET elo_change = $1, mmr_after = $2 WHERE match_id = $3 AND user_id = $4`,
          [player.elo_change, player.elo, matchId, player.user_id],
        )
      }
    }),
  )

  await Promise.all(updatePromises)

  console.log(`Updated elo_change and win_streak for match ${matchId}`)

  try {
    // close match in DB
    console.log(`Ending match ${matchId}, cancelled: ${cancelled}`)

    // get log file using glob library
    // const pattern = path
    //   .join(__dirname, '..', 'logs', `match-${matchId}_*.log`)
    //   .replace(/\\/g, '/')
    // const files = await glob(pattern)
    // const file: string | null = files[0] ?? null

    // TODO: Re-add this and send it to the website
    // if (file) {
    //   // format and send transcript
    //   const logContent = fs.readFileSync(file, 'utf8')
    //   const logLines = logContent
    //     .split('\n')
    //     .filter((line) => line.trim() !== '')
    //   const parsedLogLines = await parseLogLines(logLines)
    //   console.log(parsedLogLines) // json body
    //
    //   // delete the log file after transcript is sent
    //   fs.unlinkSync(file)
    // }

    // delete match channel
    try {
      const wasSuccessfullyDeleted = await deleteMatchChannel(matchId)
      if (!wasSuccessfullyDeleted) {
        console.log(`Channel id not found / failed to delete match ${matchId}`)
      }
    } catch (err) {
      console.error(`Failed to delete match channel for match ${matchId}:`, err)
      // Continue execution even if channel deletion fails
    }
  } catch (err) {
    console.error(
      `Error in file formatting or channel deletion for match ${matchId}:`,
      err,
    )
  }

  try {
    const guild =
      client.guilds.cache.get(process.env.GUILD_ID!) ??
      (await client.guilds.fetch(process.env.GUILD_ID!))

    // Compute title with deck/stake info
    let titleText = `${queueSettings.queue_name} Match #${matchId} 🏆`
    if (matchData.deck || matchData.stake) {
      const matchInfoParts: string[] = []
      if (matchData.deck) {
        const deckData = await getDeckByName(matchData.deck)
        if (deckData) matchInfoParts.push(`${deckData.deck_emote}`)
      }
      if (matchData.stake) {
        const stakeData = await getStakeByName(matchData.stake)
        if (stakeData) matchInfoParts.push(`${stakeData.stake_emote}`)
      }
      if (matchInfoParts.length > 0) {
        titleText = `${queueSettings.queue_name} Match #${matchId} ${matchInfoParts.join('')}`
      }
    }

    // Build team display data
    const teamDisplayData = await Promise.all(
      (teamResults?.teams ?? []).map(async (team) => {
        const playerList = await Promise.all(
          team.players.map((player) => guild.members.fetch(player.user_id)),
        )
        const playerNameList = playerList.map(
          (user) =>
            `${team.score === 1 ? `__${user.displayName}__` : user.displayName}`,
        )

        let label =
          team.score === 1
            ? `${playerNameList.join('\n')}`
            : `${playerNameList.join('\n')}`

        const description = await Promise.all(
          team.players.map(async (player) => {
            const queueRole = await getUserQueueRole(queueId, player.user_id)
            let emoteText = ''

            if (queueRole) {
              const role = await guild.roles.fetch(queueRole.role_id)
              if (role) {
                emoteText = queueRole.emote ? ` ${queueRole.emote}` : ''
                if (playerNameList.length == 1) {
                  label = `${label}${emoteText}`
                }
              }
            }

            return `<@${player.user_id}> *${player.elo_change && player.elo_change > 0 ? `+` : ``}${player.elo_change}* **(${player.elo})**`
          }),
        )

        return {
          isWinningTeam: team.score === 1,
          label,
          description: description.join('\n'),
        }
      }),
    )

    // Build winners and losers text
    const winnersLines: string[] = []
    const losersLines: string[] = []

    for (const team of teamDisplayData) {
      const teamText = `${team.label}\n${team.description}`
      if (team.isWinningTeam) {
        winnersLines.push(`${teamText}`)
      } else {
        losersLines.push(teamText)
      }
    }

    // Build results container using Components v2
    const resultsContainer = new ContainerBuilder()
      .setAccentColor(parseInt(queueSettings.color.replace('#', ''), 16))
      .addTextDisplayComponents((td) => td.setContent(`## ${titleText}`))
      .addSeparatorComponents((sep) => sep.setDivider(true))
      .addTextDisplayComponents((td) =>
        td.setContent(`### ${winnersLines.join('\n')}`),
      )
      .addSeparatorComponents((sep) =>
        sep.setDivider(false).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents((td) =>
        td.setContent(`### ${losersLines.join('\n')}`),
      )
      .addSeparatorComponents((sep) => sep.setDivider(true))
      .addActionRowComponents((row) =>
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`rematch-${matchId}`)
            .setLabel('Rematch')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`match-contest-${matchId}`)
            .setLabel('Contest Match')
            .setEmoji('📩')
            .setStyle(ButtonStyle.Secondary),
        ),
      )

    const resultsChannel = await getMatchResultsChannel()
    if (!resultsChannel) {
      console.error(`No results channel found for match ${matchId}`)
      return false
    }

    console.log(`Sending results to ${resultsChannel.id} on match ${matchId}`)
    const existingResultsMsgId = await getMatchResultsMessageId(matchId)
    if (existingResultsMsgId) {
      const existingResultsMsg =
        await resultsChannel.messages.fetch(existingResultsMsgId)
      if (existingResultsMsg) {
        await existingResultsMsg.edit({
          embeds: [],
          components: [resultsContainer],
          flags: MessageFlags.IsComponentsV2,
        })
      }
    } else {
      const resultsMsg = await resultsChannel.send({
        components: [resultsContainer],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      })
      await setMatchResultsMessageId(matchId, resultsMsg.id)
    }
  } catch (err) {
    console.error(`Failed to send match results for match ${matchId}:`, err)
    // Continue execution even if sending results fails
  }

  // Update queue log message after everything else is done
  await updateQueueLogMessage(matchId, queueId, teamResults, false)

  // Send webhook notification
  await sendWebhook('MATCH_COMPLETED', {
    matchId,
    queueId,
    teamResults,
  })

  return true
}

// Send webhook notification
export async function sendWebhook(action: string, payload: any): Promise<void> {
  try {
    const webhookUrl = process.env.WEBHOOK_URL
    const webhookSecret = process.env.WEBHOOK_QUERY_SECRET

    if (webhookUrl && webhookSecret) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${webhookSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          ...payload,
        }),
      })
      console.log(`Webhook sent for action: ${action}`)
    }
  } catch (err) {
    console.error(`Failed to send webhook for action ${action}:`, err)
  }
}

// delete match channel
export async function deleteMatchChannel(matchId: number): Promise<boolean> {
  const textChannel = await getMatchChannel(matchId)
  if (!textChannel) {
    console.error(`No text channel found for match ${matchId}`)
    return false
  }

  // Clear the message count for this channel
  clearChannelMessageCount(textChannel.id)

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

// Update match count voice channel name
export async function updateMatchCountChannel(): Promise<void> {
  try {
    // Get count of active matches
    const activeMatches = await getActiveMatches()
    const activeMatchCount = activeMatches.length || 0

    // Get match count channel ID from settings
    const settingsRes = await pool.query(
      `SELECT match_count_channel_id FROM settings WHERE singleton = true`,
    )
    const channelId = settingsRes.rows[0]?.match_count_channel_id

    if (!channelId) return

    // Fetch and update the channel
    const guild = await getGuild()

    const channel = await guild.channels.fetch(channelId)

    if (channel && channel.type === ChannelType.GuildVoice) {
      await channel
        .setName(
          `${activeMatchCount} Active Match${activeMatchCount === 1 ? '' : 'es'}`,
        )
        .catch((err) => {
          if (err.code !== 50013) {
            // Only log if it's not a rate limit error
            console.log('Failed to update match count channel:', err.message)
          }
        })
    }
  } catch (err) {
    console.error('Failed to update match count channel:', err)
  }
}

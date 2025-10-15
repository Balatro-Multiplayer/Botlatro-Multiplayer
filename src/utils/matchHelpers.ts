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
  getActiveMatches,
  getDeckByName,
  getDeckList,
  getDecksInQueue,
  getMatchChannel,
  getMatchData,
  getMatchResultsChannel,
  getQueueIdFromMatch,
  getQueueSettings,
  getStakeByName,
  getStakeList,
  getUserDefaultDeckBans,
  getUserQueueRole,
  getWinningTeamFromMatch,
  setMatchStakeVoteTeam,
  setMatchVoiceChannel,
  setPickedMatchDeck,
  updatePlayerWinStreak,
} from './queryDB'
import { Decks, MatchUsers, Stakes, teamResults } from 'psqlDB'
import dotenv from 'dotenv'
import { QueryResult } from 'pg'
// import * as fs from 'fs'
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
  for (const team of teamData.teams) {
    for (const player of team.players) {
      teamPingString += `<@${player.user_id}> `
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

export async function endMatch(
  matchId: number,
  cancelled = false,
): Promise<boolean> {
  try {
    // close match in DB
    await closeMatch(matchId)

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
    const wasSuccessfullyDeleted = await deleteMatchChannel(matchId)
    if (!wasSuccessfullyDeleted) {
      console.error(`Failed to delete match channel for match ${matchId}`)
    }

    if (cancelled) return true
  } catch (err) {
    console.error(
      `Error in file formatting or channel deletion for match ${matchId}:`,
      err,
    )
  }

  // build results button row
  const resultsButtonRow: ActionRowBuilder<ButtonBuilder> =
    new ActionRowBuilder<ButtonBuilder>().addComponents(
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
    )

  const matchTeams = await getTeamsInMatch(matchId)
  const winningTeamId = await getWinningTeamFromMatch(matchId)
  if (!winningTeamId) {
    console.error(`No winning team found for match ${matchId}`)
    return false
  }

  const queueId = await getQueueIdFromMatch(matchId)
  const queueSettings = await getQueueSettings(queueId, ['queue_name', 'color'])
  const matchData = await getMatchData(matchId)

  let teamResults: teamResults | null
  // create our teamResults object here
  const teamResultsData: teamResults = {
    teams: matchTeams.teams.map((teamResult) => ({
      id: teamResult.id,
      score: teamResult.score as 0 | 0.5 | 1,
      players: teamResult.players as MatchUsers[],
    })),
  }

  teamResults = await calculateNewMMR(queueId, matchId, teamResultsData)

  // Save elo_change and winstreak to database
  const updatePromises = teamResults.teams.flatMap((team) =>
    team.players.map(async (player) => {
      // Update win streak
      await updatePlayerWinStreak(player.user_id, queueId, team.score == 1)

      // Update elo change if it exists
      if (player.elo_change !== undefined && player.elo_change !== null) {
        await pool.query(
          `UPDATE match_users SET elo_change = $1 WHERE match_id = $2 AND user_id = $3`,
          [player.elo_change, matchId, player.user_id],
        )
      }
    }),
  )

  await Promise.all(updatePromises)

  // build results embed
  const resultsEmbed = new EmbedBuilder()
    .setTitle(`🏆 ${queueSettings.queue_name} Match #${matchId} 🏆`)
    .setColor(queueSettings.color as any)

  const guild =
    client.guilds.cache.get(process.env.GUILD_ID!) ??
    (await client.guilds.fetch(process.env.GUILD_ID!))

  // running for every team then combining at the end
  const embedFields = await Promise.all(
    (teamResults?.teams ?? []).map(async (team) => {
      const playerList = await Promise.all(
        team.players.map((player) => guild.members.fetch(player.user_id)),
      )
      const playerNameList = playerList.map((user) => user.displayName)

      // show name for every player in team
      let label =
        team.score === 1
          ? `__${playerNameList.join('\n')}__`
          : `${playerNameList.join('\n')}`

      // show id, elo change, new elo, and queue role for every player in team
      const description = await Promise.all(
        team.players.map(async (player) => {
          // Get the player's queue role
          const queueRole = await getUserQueueRole(queueId, player.user_id)
          let emoteText = ''

          if (queueRole) {
            // Fetch the role from Discord to get the name
            const guild =
              client.guilds.cache.get(process.env.GUILD_ID!) ??
              (await client.guilds.fetch(process.env.GUILD_ID!))
            const role = await guild.roles.fetch(queueRole.role_id)
            if (role) {
              // Include emote if it exists
              emoteText = queueRole.emote ? `${queueRole.emote} ` : ''
              if (playerNameList.length == 1) {
                label = `${label} ${emoteText}`
              }
            }
          }

          return `<@${player.user_id}> *${player.elo_change && player.elo_change > 0 ? `+` : ``}${player.elo_change}* **(${player.elo})**`
        }),
      )

      // return array of objects to embedFields
      return {
        isWinningTeam: team.score === 1,
        label,
        description: description.join('\n'),
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

  // Add deck and stake information if available
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
    resultsEmbed.setTitle(
      `${queueSettings.queue_name} Match #${matchId} ${matchInfoParts.join('')}`,
    )
  }

  const resultsChannel = await getMatchResultsChannel()
  if (!resultsChannel) {
    console.error(`No results channel found for match ${matchId}`)
    return false
  }

  await resultsChannel.send({
    embeds: [resultsEmbed],
    components: [resultsButtonRow],
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

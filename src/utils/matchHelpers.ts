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
  getStake,
  getStakeByName,
  getStakeList,
  getUserDefaultDeckBans,
  getUserQueueRole,
  getWinningTeamFromMatch,
  setMatchResultsMessageId,
  setMatchTupleBans,
  setMatchVoiceChannel,
  setPickedMatchDeck,
  setPickedMatchStake,
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
import { generateAndStoreHtmlTranscript } from './exportTranscripts'
import { TupleBan, TupleBans } from './TupleBans'
import {
  getCombinedEmote,
  getCombinedOrFallback,
  parseEmoji,
} from './combinedEmoteCache'

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
  queueId?: number | null,
  overrideTuples?: string[], // For tuple bans step 3: pass the specific tuples to show
  initialTuples?: TupleBan[], // Pre-generated tuples for step 1 (to show on embed)
): Promise<ActionRowBuilder<StringSelectMenuBuilder>> {
  let deckChoices = await getDeckList(includeCustomDecks)
  deckChoices = deckChoices.filter((deck) => !bannedDecks.includes(deck.id))

  if (overrideDecks.length > 0) {
    deckChoices = deckChoices.filter((deck) => overrideDecks.includes(deck.id))
  }

  // check if current queue is using tuple bans or not
  let useTupleBan = false
  if (queueId) {
    console.log('queueId: ', queueId)
    useTupleBan = (
      await pool.query(`SELECT use_tuple_bans FROM queues WHERE id = $1`, [
        queueId,
      ])
    ).rows[0].use_tuple_bans
  }

  let options: StringSelectMenuOptionBuilder[]

  // still use old bans if this is falsey
  if (!useTupleBan || !queueId) {
    options = deckChoices.map((deck: Decks) => {
      return new StringSelectMenuOptionBuilder()
        .setLabel(deck.deck_name)
        .setEmoji(deck.deck_emote)
        .setValue(`${deck.id}`)
        .setDescription(deck.deck_desc)
    })
  }
  // If we have override tuples, use those directly
  else if (overrideTuples && overrideTuples.length > 0) {
    const numberEmojis = [
      '1️⃣',
      '2️⃣',
      '3️⃣',
      '4️⃣',
      '5️⃣',
      '6️⃣',
      '7️⃣',
      '8️⃣',
      '9️⃣',
      '🔟',
    ]
    options = await Promise.all(
      overrideTuples.map(async (tupleStr, index) => {
        const [deckIdStr, stakeIdStr] = tupleStr.split('_')
        const deckId = parseInt(deckIdStr)
        const stakeId = parseInt(stakeIdStr)
        const deck = deckChoices.find((d) => d.id === deckId)
        const stake = await getStake(stakeId)

        const option = new StringSelectMenuOptionBuilder()
          .setLabel(
            `${deck?.deck_name ?? 'N/A'} / ${stake?.stake_name ?? 'N/A'}`,
          )
          .setValue(tupleStr)
          .setDescription(deck?.deck_desc ?? 'No description')
        const combined =
          deck?.deck_name && stake?.stake_name
            ? getCombinedEmote(deck.deck_name, stake.stake_name)
            : null
        const parsed = combined ? parseEmoji(combined) : null
        if (parsed) {
          option.setEmoji(parsed)
        } else if (index < numberEmojis.length) {
          option.setEmoji(numberEmojis[index])
        }
        return option
      }),
    )
  }
  // otherwise generate new tuple bans (filtering banned decks) or use pre-generated ones
  else {
    const numberEmojis = [
      '1️⃣',
      '2️⃣',
      '3️⃣',
      '4️⃣',
      '5️⃣',
      '6️⃣',
      '7️⃣',
      '8️⃣',
      '9️⃣',
      '🔟',
    ]
    let tupleBans: TupleBan[]
    if (initialTuples && initialTuples.length > 0) {
      tupleBans = initialTuples
    } else {
      const tupleGen = new TupleBans(queueId, bannedDecks)
      await tupleGen.init()
      tupleBans = tupleGen.getTupleBans()
    }
    options = tupleBans.map((tuple: TupleBan, index: number) => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(`${tuple.deckName ?? 'N/A'} / ${tuple.stakeName ?? 'N/A'}`)
        .setValue(`${tuple.deckId}_${tuple.stakeId}`)
        .setDescription(tuple.deckDescription)
      const parsed = tuple.combinedEmote
        ? parseEmoji(tuple.combinedEmote)
        : null
      if (parsed) {
        option.setEmoji(parsed)
      } else if (index < numberEmojis.length) {
        option.setEmoji(numberEmojis[index])
      }
      return option
    })
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholderText)
    .addOptions(
      options ?? [
        new StringSelectMenuOptionBuilder().setValue('an error occurred'),
      ],
    )

  if (minSelect > 1) selectMenu.setMinValues(minSelect)
  if (maxSelect > 1) selectMenu.setMaxValues(maxSelect)

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu,
  )
}

/**
 * Advances the deck ban/pick process to the next step
 * @param choices - Array of deck IDs or tuple strings (deckId_stakeId) chosen in the current step
 * @param step - Current step (1, 2, 3 for regular; 1, 2, 3, 4 for tuple bans)
 * @param matchId - Match ID
 * @param startingTeamId - The team that started the banning process
 * @param channel - Text channel to send messages to
 * @param remainingTuples - For tuple bans: the remaining tuple strings before this step's bans
 * @param interaction - Optional interaction to update instead of sending new message
 */
export async function advanceDeckBanStep(
  choices: string[],
  step: number,
  matchId: number,
  startingTeamId: number,
  channel: TextChannel,
  remainingTuples?: string[],
  interaction?: any,
): Promise<void> {
  const queueId = await getQueueIdFromMatch(matchId)
  const matchTeams = await getTeamsInMatch(matchId)
  const deckOptions = await getDecksInQueue(queueId)
  const queueSettings = await getQueueSettings(queueId)
  const step2Amt = queueSettings.second_deck_ban_num

  // Check if this queue uses tuple bans
  const useTupleBans = (
    await pool.query(`SELECT use_tuple_bans FROM queues WHERE id = $1`, [
      queueId,
    ])
  ).rows[0]?.use_tuple_bans

  // Tuple ban step amounts: step 1 = 1, step 2 = 2, step 3 = 2, step 4 = pick 1
  const tupleBanAmounts = [1, 3, 3, 1]
  const finalStep = useTupleBans ? 4 : 3

  // Parse choices - extract deck IDs (and stake ID for final pick if tuple)
  const deckChoices: number[] = choices.map((choice) => {
    if (choice.includes('_')) {
      return parseInt(choice.split('_')[0])
    }
    return parseInt(choice)
  })

  // Handle final deck pick
  if (step === finalStep) {
    const finalDeckPick = deckOptions.find((deck) =>
      deckChoices.includes(deck.id),
    )

    if (finalDeckPick) {
      await setPickedMatchDeck(matchId, finalDeckPick.deck_name, true)

      // If tuple bans, also set the stake and delete the embed message
      if (useTupleBans && choices[0]?.includes('_')) {
        const stakeId = parseInt(choices[0].split('_')[1])
        const stakeData = await getStake(stakeId)
        if (stakeData) {
          await setPickedMatchStake(matchId, stakeData.stake_name, true)
          // Delete the embed message if we have the interaction
          if (interaction) {
            await interaction.message.delete().catch(() => {})
          }
          const selectedEmote = getCombinedOrFallback(
            finalDeckPick.deck_name,
            stakeData.stake_name,
            finalDeckPick.deck_emote,
            stakeData.stake_emote,
          )
          await channel.send({
            content: `## Selected: ${selectedEmote} ${finalDeckPick.deck_name} on ${stakeData.stake_name}`,
          })
        } else {
          if (interaction) {
            await interaction.message.delete().catch(() => {})
          }
          await channel.send({
            content: `## Selected Deck: ${finalDeckPick.deck_emote} ${finalDeckPick.deck_name}`,
          })
        }
      } else {
        await channel.send({
          content: `## Selected Deck: ${finalDeckPick.deck_emote} ${finalDeckPick.deck_name}`,
        })
      }
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

  // Calculate remaining tuples after this step's bans
  let nextRemainingTuples: string[] | undefined
  if (useTupleBans && remainingTuples) {
    // Filter out the banned choices from remaining tuples
    nextRemainingTuples = remainingTuples.filter(
      (tuple) => !choices.includes(tuple),
    )
  }

  // Determine select amount for next step
  let selectAmount: number
  if (useTupleBans) {
    selectAmount = tupleBanAmounts[nextStep - 1] // 0-indexed array
  } else {
    selectAmount = nextStep === 2 ? step2Amt : 1
  }

  // Build placeholder text
  const isBanStep = useTupleBans ? nextStep < 4 : nextStep < 3
  const actionWord = isBanStep ? 'ban' : 'pick'
  const placeholderText =
    matchTeams.teams[nextTeamId].players.length > 1
      ? `Team ${matchTeams.teams[nextTeamId].id}: Select ${selectAmount} option${selectAmount > 1 ? 's' : ''} to ${actionWord}.`
      : `${nextMember.displayName}: Select ${selectAmount} option${selectAmount > 1 ? 's' : ''} to ${actionWord}.`

  const deckSelMenu = await setupDeckSelect(
    `deck-bans-${nextStep}-${matchId}-${startingTeamId}`,
    useTupleBans
      ? placeholderText
      : matchTeams.teams[nextTeamId].players.length > 1
        ? `Team ${matchTeams.teams[nextTeamId].id}: Select ${selectAmount} ${useTupleBans ? 'option' : 'deck'}${selectAmount > 1 ? 's' : ''} to play.`
        : `${nextMember.displayName}: Select ${selectAmount} ${useTupleBans ? 'option' : 'deck'}${selectAmount > 1 ? 's' : ''} to play.`,
    selectAmount,
    selectAmount,
    true,
    useTupleBans ? [] : nextStep === 3 ? [] : deckChoices,
    useTupleBans
      ? []
      : nextStep === 3
        ? deckChoices
        : deckOptions.map((deck) => deck.id),
    queueId,
    useTupleBans ? nextRemainingTuples : undefined,
  )

  // Add random pick button
  const randomButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `random-deck-select-${nextStep}-${matchId}-${startingTeamId}-${selectAmount}`,
      )
      .setLabel(
        `Random ${isBanStep ? 'Ban' : 'Pick'}${selectAmount > 1 ? 's' : ''}`,
      )
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Secondary),
  )

  // For tuple bans with interaction, build updated embed showing remaining options
  if (useTupleBans && remainingTuples && interaction) {
    // Build display list from only the remaining (non-banned) tuples
    const tupleDisplayList = await Promise.all(
      (nextRemainingTuples ?? []).map(async (tupleStr, i) => {
        const [deckIdStr, stakeIdStr] = tupleStr.split('_')
        const deck = deckOptions.find((d) => d.id === parseInt(deckIdStr))
        const stake = await getStake(parseInt(stakeIdStr))
        const emoteDisplay = `${deck?.deck_emote || ''} ${stake?.stake_emote || ''}`
        return `**\`${i + 1}.\`** ${emoteDisplay} ${deck?.deck_name || 'N/A'} / ${stake?.stake_name || 'N/A'}`
      }),
    )

    const tupleListStr = tupleDisplayList.join('\n')

    // Get team names for embed description
    const currentTeamName =
      matchTeams.teams[nextTeamId].players.length > 1
        ? `Team ${matchTeams.teams[nextTeamId].id}`
        : nextMember.displayName

    const embedDescription =
      `**${currentTeamName}** ${isBanStep ? `bans ${selectAmount}` : 'picks 1'} option${selectAmount > 1 ? 's' : ''}.\n\n` +
      `**Available Options:**\n${tupleListStr}`

    const updatedEmbed = new EmbedBuilder()
      .setTitle(`Bans - Step ${nextStep}/4`)
      .setDescription(embedDescription)
      .setColor(0xff0000)

    await interaction.deferUpdate()
    await interaction.message.delete().catch(() => {})
    await channel.send({
      content: `<@${matchTeams.teams[nextTeamId].players[0].user_id}>`,
      embeds: [updatedEmbed],
      components: [deckSelMenu, randomButtonRow],
    })
  } else if (useTupleBans && interaction) {
    // Tuple bans without remainingTuples - delete and resend
    await interaction.deferUpdate()
    await interaction.message.delete().catch(() => {})
    await channel.send({
      components: [deckSelMenu, randomButtonRow],
    })
  } else {
    // Regular deck bans - send new message
    let pickDisplayLines: string[]
    if (useTupleBans) {
      pickDisplayLines = await Promise.all(
        choices.map(async (choice) => {
          if (choice.includes('_')) {
            const [deckIdStr, stakeIdStr] = choice.split('_')
            const deck = deckOptions.find((d) => d.id === parseInt(deckIdStr))
            const stake = await getStake(parseInt(stakeIdStr))
            if (deck && stake) {
              const bannedEmote = getCombinedOrFallback(
                deck.deck_name,
                stake.stake_name,
                deck.deck_emote,
                stake.stake_emote,
              )
              return `${bannedEmote} - ${deck.deck_name} / ${stake.stake_name}`
            }
          }
          const deck = deckOptions.find((d) => d.id === parseInt(choice))
          return deck ? `${deck.deck_emote} - ${deck.deck_name}` : choice
        }),
      )
    } else {
      pickDisplayLines = deckOptions
        .filter((deck) => deckChoices.includes(deck.id))
        .map((deck) => `${deck.deck_emote} - ${deck.deck_name}`)
    }

    await channel.send({
      content: `<@${matchTeams.teams[nextTeamId].players[0].user_id}>\n### Banned:\n${pickDisplayLines.join('\n')}`,
      components: [deckSelMenu, randomButtonRow],
    })
  }
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

  // Convert deck IDs to strings for advanceDeckBanStep
  // Note: Default deck bans don't apply to tuple bans, so remainingTuples is undefined
  await advanceDeckBanStep(
    userDefaultBans.map((id) => id.toString()),
    step,
    matchId,
    startingTeamId,
    channel,
    undefined, // remainingTuples
    undefined, // interaction
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

  // Check if the queue uses tuple bans
  const useTupleBans = (
    await pool.query(`SELECT use_tuple_bans FROM queues WHERE id = $1`, [
      queueId,
    ])
  ).rows[0]?.use_tuple_bans

  const deckList = await getDecksInQueue(queueId)

  // Generate tuples if using tuple bans (so we can show them on the embed)
  let generatedTuples: TupleBan[] = []
  if (useTupleBans) {
    const tupleGen = new TupleBans(queueId, [])
    await tupleGen.init()
    generatedTuples = tupleGen.getTupleBans()
  }

  // Build embed description
  let embedDescription: string
  let embedTitle: string
  if (useTupleBans) {
    const tupleListStr = generatedTuples
      .map((t, i) => {
        const listEmote = `${t.deckEmoji} ${t.stakeEmoji}`
        return `**\`${i + 1}.\`** ${listEmote} ${t.deckName} / ${t.stakeName}`
      })
      .join('\n')
    // Tuple ban flow: ban 1, ban 2, ban 2, pick 1
    embedTitle = `Bans - Step 1/4`
    embedDescription =
      `**${randomTeams[0].name}** bans 1 option.\n\n` +
      `**Available Options:**\n${tupleListStr}`
  } else {
    embedTitle = `Bans`
    embedDescription =
      `**${randomTeams[0].name}** bans up to ${deckBanFirstNum} deck${deckBanFirstNum > 1 ? 's' : ''}.\n` +
      `**${randomTeams[1].name}** chooses ${deckBanSecondNum} deck${deckBanSecondNum > 1 ? 's' : ''}.\n` +
      `**${randomTeams[0].name}** picks a deck to play.\n` +
      `Vote using the dropdown below!\n\nAlternately, you can use random deck and random stake`
  }

  const deckEmbed = new EmbedBuilder()
    .setTitle(embedTitle)
    .setDescription(embedDescription)
    .setColor(0xff0000)

  // For tuple bans, store original tuples in DB for tracking across steps
  if (useTupleBans && generatedTuples.length > 0) {
    const tupleStrings = generatedTuples.map((t) => `${t.deckId}_${t.stakeId}`)
    await setMatchTupleBans(matchId, tupleStrings)
  }

  // For tuple bans: step 1 bans 1, otherwise use DB value
  const step1BanAmount = useTupleBans ? 1 : deckBanFirstNum

  const deckSelMenu = await setupDeckSelect(
    `deck-bans-1-${matchId}-${randomTeams[1].teamIndex}`,
    `${randomTeams[0].name}: Select ${step1BanAmount} ${useTupleBans ? 'option' : 'deck'}${step1BanAmount > 1 ? 's' : ''} to ban.`,
    step1BanAmount,
    step1BanAmount,
    true,
    [],
    deckList.map((deck) => deck.id),
    queueId,
    undefined, // overrideTuples
    generatedTuples, // initialTuples (pre-generated for step 1)
  )

  const deckBanButtons = [
    new ButtonBuilder()
      .setCustomId(
        `random-deck-select-1-${matchId}-${randomTeams[1].teamIndex}-${step1BanAmount}`,
      )
      .setLabel('Random Ban')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Secondary),
  ]

  if (useTupleBans) {
    deckBanButtons.push(
      new ButtonBuilder()
        .setCustomId(`reroll-tuples-${matchId}`)
        .setLabel('Reroll Options')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    )
    const players = await pool.query(
      `SELECT elo FROM queue_users WHERE queue_id = $1`,
      [queueId],
    )
    const vetoLimit = await pool.query(
      `SELECT veto_mmr_threshold FROM queues WHERE id = $1`,
      [queueId],
    )

    const canVeto = players.rows.some(
      (player) => player.elo <= (vetoLimit.rows[0].veto_mmr_threshold ?? 200),
    )
    if (canVeto)
      deckBanButtons.push(
        new ButtonBuilder()
          .setCustomId(`veto-tuples-${matchId}`)
          .setLabel('VETO')
          .setEmoji('<:white_stake:1407754838108016733>')
          .setStyle(ButtonStyle.Success),
      )
  } else {
    deckBanButtons.push(
      new ButtonBuilder()
        .setCustomId(
          `use-default-bans-1-${matchId}-${randomTeams[1].teamIndex}`,
        )
        .setLabel('Use Preset Bans')
        .setStyle(ButtonStyle.Primary),
    )
  }

  const deckBanButtonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...deckBanButtons,
  )

  // await setMatchStakeVoteTeam(matchId, randomTeams[0].teamIndex)
  // const stakeBanButtons = await setupStakeButtons(matchId)
  // const teamUsers = randomTeams[0].players
  //   .map((user: MatchUsers) => `<@${user.user_id}>`)
  //   .join('\n')

  await textChannel.send({
    content: useTupleBans
      ? `<@${randomTeams[0].players[0].user_id}>`
      : undefined,
    embeds: [deckEmbed],
    components: [deckSelMenu, deckBanButtonsRow],
  })
  // await textChannel.send({
  //   content: `**Stake Bans:**\n${teamUsers}`,
  //   components: stakeBanButtons,
  // })

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

    const updatedEmbed = EmbedBuilder.from(queueLogMsg.embeds[0])
      .setFields(logFields)
      .setColor(cancelled ? '#ff0000' : '#2ECD71')

    const components = queueLogMsg.components.map((row) => {
      const updatedRow = ActionRowBuilder.from(row.toJSON() as any)
      updatedRow.components.forEach((component) => {
        if (
          component.data.type === 2 &&
          (component.data as any).label === 'View Transcripts'
        ) {
          ;(component as any).setDisabled(false)
        }
      })
      return updatedRow
    })

    await queueLogMsg.edit({
      embeds: [updatedEmbed],
      components: components as any,
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

  if (cancelled) {
    console.log(`Match ${matchId} cancelled.`)

    // Generate HTML transcript before deleting the channel
    try {
      const matchChannel = await getMatchChannel(matchId)
      if (matchChannel) {
        await generateAndStoreHtmlTranscript(matchId, matchChannel)
      }
    } catch (err) {
      console.error(
        `Failed to generate transcript for cancelled match ${matchId}:`,
        err,
      )
    }

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

    // Generate HTML transcript before deleting the channel
    try {
      const matchChannel = await getMatchChannel(matchId)
      if (matchChannel) {
        await generateAndStoreHtmlTranscript(matchId, matchChannel)
      }
    } catch (err) {
      console.error(`Failed to generate transcript for match ${matchId}:`, err)
    }

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
      const deckData = matchData.deck
        ? await getDeckByName(matchData.deck)
        : null
      const stakeData = matchData.stake
        ? await getStakeByName(matchData.stake)
        : null
      if (deckData && stakeData) {
        const combined = getCombinedEmote(
          deckData.deck_name,
          stakeData.stake_name,
        )
        if (combined) {
          matchInfoParts.push(combined)
        } else {
          matchInfoParts.push(`${deckData.deck_emote}`)
          matchInfoParts.push(`${stakeData.stake_emote}`)
        }
      } else {
        if (deckData) matchInfoParts.push(`${deckData.deck_emote}`)
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
  sendWebhook('MATCH_COMPLETED', {
    matchId,
    queueId,
    teamResults,
  })

  return true
}

// Send webhook notification (fire-and-forget, never throws)
export function sendWebhook(action: string, payload: any): void {
  const webhookUrl = process.env.WEBHOOK_URL
  const webhookSecret = process.env.WEBHOOK_QUERY_SECRET

  if (!webhookUrl || !webhookSecret) return

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
    signal: controller.signal,
  })
    .then(() => {
      console.log(`Webhook sent for action: ${action}`)
    })
    .catch((err) => {
      console.error(`Failed to send webhook for action ${action}:`, err)
    })
    .finally(() => {
      clearTimeout(timeout)
    })
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

    // hard coded ids for the two ranked game modes. will change if queues are deleted and re-created
    const standardId = 1
    const legacyId = 7

    const standardCount =
      activeMatches.filter((m) => m.queue_id === standardId).length || 0
    const legacyCount =
      activeMatches.filter((m) => m.queue_id === legacyId).length || 0

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
          `${activeMatchCount} Active Match${activeMatchCount === 1 ? '' : 'es'} (${standardCount}:${legacyCount})`,
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

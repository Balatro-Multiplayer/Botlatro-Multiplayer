// noinspection JSUnusedGlobalSymbols

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  GuildMember,
  Interaction,
  MessageComponentInteraction,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
  TextDisplayBuilder,
} from 'discord.js'
import { pool } from '../db'
import {
  createMatch,
  joinQueues,
  setupViewStatsButtons,
  timeSpentInQueue,
  updateQueueMessage,
} from '../utils/queueHelpers'
import {
  advanceDeckBanStep,
  applyDefaultDeckBansAndAdvance,
  endMatch,
  getTeamsInMatch,
  sendWebhook,
  setupDeckSelect,
} from '../utils/matchHelpers'
import { TupleBans } from '../utils/TupleBans'
import {
  checkUserBanned,
  getActiveQueues,
  getActiveSeason,
  getDeckList,
  getHelperRoleId,
  getMatchChannel,
  getMatchData,
  getMatchIdFromChannel,
  getMatchStakeVoteTeam,
  getPlayerElo,
  getQueueIdFromMatch,
  getQueueIdFromName,
  getQueueSettings,
  getSettings,
  getStake,
  getStakeByName,
  getStatsCanvasUserData,
  getUserDmsEnabled,
  getUserQueues,
  partyUtils,
  resetAllCurrentEloRangeForUser,
  setMatchBestOf,
  setMatchStakeVoteTeam,
  setMatchTupleBans,
  setPickedMatchStake,
  setQueueDeckBans,
  setUserDefaultDeckBans,
  setUserPriorityQueue,
  setWinningTeam,
  updateUserDisplayName,
  userInMatch,
} from '../utils/queryDB'
import {
  getBestOfMatchScores,
  getUserVote,
  getVotesForMatch,
  handleTwoPlayerMatchVoting,
  handleVoting,
  removeUserVote,
  setUserVote,
} from '../utils/voteHelpers'
import { drawPlayerStatsCanvas } from '../utils/canvasHelpers'
import { generateBackgroundPreview } from '../commands/queues/setStatsBackground'
import { getBackgroundById } from '../utils/backgroundManager'
import { client } from '../client'

// Track users currently processing queue joins to prevent duplicates
const processingQueueJoins = new Set<string>()

// Track matches currently being ended to prevent duplicate processing
const processingMatchEnds = new Set<number>()
// Track matches that have consumed their one-time tuple reroll
const tupleRerollUsed = new Set<number>()
// Track matches that have consumed their one-time tuple veto
const tupleVetoUsed = new Set<number>()

export default {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    if (!interaction) return console.log('*No interaction found*')

    // Update display name for all interactions except autocomplete
    if (
      !interaction.isAutocomplete() &&
      interaction.member instanceof GuildMember
    ) {
      try {
        await updateUserDisplayName(
          interaction.user.id,
          interaction.member.displayName,
        )
      } catch (err) {
        console.error('Error updating display name:', err)
      }
    }

    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName)

      if (!command) {
        console.error(
          `No command matching ${interaction.commandName} was found.`,
        )
        return
      }

      try {
        await command.execute(interaction)
      } catch (err) {
        console.error(err)
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error.',
            flags: MessageFlags.Ephemeral,
          })
        } else {
          if (interaction) {
            await interaction.reply({
              content: 'There was an error.',
              flags: MessageFlags.Ephemeral,
            })
          } else {
            console.error('Interaction is undefined', err)
          }
        }
      }
    }
    //autocomplete interactions
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName)
      if (!command || !command.autocomplete) return
      try {
        await command.autocomplete(interaction)
      } catch (err) {
        console.error(err)
      }
    }

    // Select Menu Interactions
    if (interaction.isStringSelectMenu()) {
      try {
        if (interaction.customId === 'join-queue') {
          // Check if user is already processing a queue join
          if (processingQueueJoins.has(interaction.user.id)) {
            return await interaction.reply({
              content: 'You are already in queue.',
              flags: MessageFlags.Ephemeral,
            })
          }

          // Mark user as processing
          processingQueueJoins.add(interaction.user.id)

          try {
            await interaction.reply({
              content: 'Joining queue...',
              flags: MessageFlags.Ephemeral,
            })
            const member = interaction.member as GuildMember

            // TEMPORARY BAN CHECK
            if (member) {
              if (
                member.roles.cache.has('1354296037094854788') ||
                (await checkUserBanned(member))
              ) {
                return await interaction.followUp({
                  content:
                    'You are queue blacklisted, and cannot join the queue.',
                  flags: MessageFlags.Ephemeral,
                })
              }
            }

            const joinedQueues = await joinQueues(
              interaction,
              interaction.values,
              interaction.user.id,
            )

            if (joinedQueues) {
              const reply = await interaction.editReply({
                content:
                  joinedQueues.length > 0
                    ? `You joined: ${joinedQueues.join(', ')}`
                    : 'You left the queue.',
              })

              await updateQueueMessage()

              // Delete the message after 10 seconds
              setTimeout(async () => {
                await interaction.deleteReply(reply.id).catch(() => {})
              }, 10000)
            } else {
              await updateQueueMessage()
            }
          } finally {
            // Always remove user from processing set
            processingQueueJoins.delete(interaction.user.id)
          }
        }

        if (interaction.customId === 'priority-queue-sel') {
          let queueSelId: number | null = parseInt(interaction.values[0])
          if (queueSelId == -1) queueSelId = null
          await setUserPriorityQueue(interaction.user.id, queueSelId)

          if (queueSelId) {
            const queueData = await getQueueSettings(queueSelId, ['queue_name'])
            interaction.update({
              content: `Successfully set priority queue to **${queueData.queue_name}**!`,
              components: [],
            })
          } else {
            interaction.update({
              content: `Successfully removed your priority queue.`,
              components: [],
            })
          }
        }

        if (interaction.customId === 'stats-background-select') {
          try {
            await interaction.deferUpdate()

            const selectedId = interaction.values[0]
            const background = getBackgroundById(selectedId)

            if (!background) {
              await interaction.followUp({
                content: 'Invalid background selected.',
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            const previewImage = await generateBackgroundPreview(
              background.filename,
            )

            // Update user's background in database
            await pool.query(
              'UPDATE users SET stat_background = $1 WHERE user_id = $2',
              [background.filename, interaction.user.id],
            )

            await interaction.followUp({
              content: `Background set to **${background.name}**!\n\nHere's a preview of your stats background:`,
              files: [previewImage],
              flags: MessageFlags.Ephemeral,
            })
          } catch (error: any) {
            console.error('Error setting background:', error)
            await interaction.followUp({
              content: `Failed to set background: ${error.message}`,
              flags: MessageFlags.Ephemeral,
            })
          }
        }

        if (interaction.values[0].includes('winmatch_')) {
          const customSelId = interaction.values[0]
          const matchId = parseInt(customSelId.split('_')[1])

          // Check if this match is already being processed
          if (processingMatchEnds.has(matchId)) {
            return await interaction.reply({
              content: 'This match is already being processed.',
              flags: MessageFlags.Ephemeral,
            })
          }

          const matchUsers = await getTeamsInMatch(matchId)
          const matchUsersArray = matchUsers.teams.flatMap((t) =>
            t.players.map((u) => u.user_id),
          )

          const botSettings = await getSettings()
          const member = interaction.member as GuildMember
          const winMatchData: string[] = interaction.values[0].split('_')
          const winMatchTeamId = parseInt(winMatchData[2])

          // Check if helper clicked the button
          if (member) {
            if (
              (member.roles.cache.has(botSettings.helper_role_id) ||
                member.roles.cache.has(botSettings.queue_helper_role_id)) &&
              !matchUsersArray.includes(interaction.user.id)
            ) {
              // Mark match as being processed
              processingMatchEnds.add(matchId)
              try {
                await setWinningTeam(matchId, winMatchTeamId)
                await endMatch(matchId)
              } finally {
                processingMatchEnds.delete(matchId)
              }
            }
          }

          try {
            await handleTwoPlayerMatchVoting(interaction, {
              participants: matchUsersArray,
              onComplete: async (interaction, winner) => {
                console.log(
                  `Starting finish vote from vote from ${interaction.user.id} with winner ${winner}`,
                )
                try {
                  const customSelId = interaction.values[0]
                  const matchDataParts: string[] = customSelId.split('_')
                  const matchId = parseInt(matchDataParts[1])
                  console.log(
                    `Finishing vote for match ${matchId}, winner ${winner}`,
                  )

                  // Check if match is already being processed
                  if (processingMatchEnds.has(matchId)) {
                    console.log(
                      `Match ${matchId} already being processed, skipping`,
                    )
                    return
                  }

                  // Mark match as being processed
                  processingMatchEnds.add(matchId)

                  // Check if this match is Best of 3 or 5
                  const matchDataObj = await getMatchData(matchId)
                  const isBo3 = matchDataObj.best_of_3
                  const isBo5 = matchDataObj.best_of_5

                  if (!isBo3 && !isBo5) {
                    try {
                      await setWinningTeam(matchId, winner)
                      await endMatch(matchId)
                    } finally {
                      processingMatchEnds.delete(matchId)
                    }
                    return
                  } else {
                    const embed = interaction.message.embeds[0]
                    const fields = embed.data.fields || []

                    // Update Best of scores in the embed (for display only)
                    const winnerIndex = winner === 1 ? 0 : 1
                    for (let i = 0; i < Math.min(2, fields.length); i++) {
                      const val = fields[i].value || ''
                      const lines = val.split('\n')

                      const cleaned = lines.filter(
                        (l) => !l.includes('Win Votes') && !l.includes('<@'),
                      )

                      const mmrIdx = cleaned.findIndex((l) => l.includes('MMR'))
                      if (mmrIdx !== -1) {
                        const mmrLine = cleaned[mmrIdx]
                        const m = mmrLine.match(/Score:\s*(\d+)/i)
                        let score = m ? parseInt(m[1], 10) || 0 : 0

                        if (i === winnerIndex) score += 1

                        cleaned[mmrIdx] =
                          mmrLine
                            .replace(/\s*-?\s*Score:\s*\d+/i, '')
                            .trimEnd() + ` - Score: ${score}`
                      }

                      fields[i].value = cleaned.join('\n')
                    }

                    // Get updated scores from the embed (after incrementing)
                    let scores = getBestOfMatchScores(fields)
                    let requiredWins = isBo5 ? 3 : isBo3 ? 2 : 1
                    const [team1Wins, team2Wins] = scores

                    // Check if a team has won the Best of series
                    let winningTeam = 0
                    if (team1Wins >= requiredWins) {
                      winningTeam = 1
                    } else if (team2Wins >= requiredWins) {
                      winningTeam = 2
                    }

                    console.log(
                      `Winning team variable for match ${matchId}: ${winningTeam}`,
                    )

                    if (winningTeam) {
                      try {
                        await setWinningTeam(matchId, winningTeam)
                        await endMatch(matchId)
                      } finally {
                        processingMatchEnds.delete(matchId)
                      }
                      return
                    }

                    // Match continues - remove from processing set
                    processingMatchEnds.delete(matchId)

                    interaction.message.embeds[0] = embed
                    await interaction.update({
                      embeds: interaction.message.embeds,
                    })
                  }
                } catch (error) {
                  console.error(error)
                  // Clean up on error
                  processingMatchEnds.delete(matchId)
                }
              },
            })
          } catch (err) {
            console.error(err)
          }
        }

        if (interaction.customId.startsWith('deck-bans-')) {
          const channel = interaction.channel as TextChannel
          const parts = interaction.customId.split('-')
          const step = parseInt(parts[2])
          const matchId = parseInt(parts[3])
          const startingTeamId = parseInt(parts[4])
          const matchTeams = await getTeamsInMatch(matchId)

          // Determine which team is active for this step
          const activeTeamId = (startingTeamId + step) % 2

          if (
            interaction.user.id !==
            matchTeams.teams[activeTeamId].players[0].user_id
          ) {
            return interaction.reply({
              content: `It's not your turn to vote for the decks!`,
              flags: MessageFlags.Ephemeral,
            })
          }

          // Extract remaining tuples from the select menu options (for tuple bans)
          // This gives us the pool of options that were available before this selection
          let remainingTuples: string[] | undefined
          const firstRow = interaction.message.components[0]
          if (firstRow && 'components' in firstRow) {
            const selectMenu = firstRow.components[0]
            if (selectMenu && 'options' in selectMenu) {
              const options = selectMenu.options as { value: string }[]
              // Check if this is tuple format (contains underscore)
              if (options.length > 0 && options[0].value.includes('_')) {
                remainingTuples = options.map((opt) => opt.value)
              }
            }
          }

          // Pass raw string values - advanceDeckBanStep handles parsing for both
          // regular deck IDs ("1") and tuple format ("1_3" for deckId_stakeId)
          // Original tuples are fetched from DB inside advanceDeckBanStep
          if (!remainingTuples) {
            await interaction.deferUpdate()
            await interaction.message.delete().catch(() => {})
          }
          await advanceDeckBanStep(
            interaction.values,
            step,
            matchId,
            startingTeamId,
            channel,
            remainingTuples,
            remainingTuples ? interaction : undefined, // Pass interaction for tuple bans to update embed
          )
        }

        if (interaction.customId.startsWith('queue-ban-decks-')) {
          const queueId = parseInt(interaction.customId.split('-')[3])
          await setQueueDeckBans(queueId, interaction.values)
          await interaction.update({
            content: 'Successfully changed queue decks that are banned.',
            components: [],
          })
        }

        if (interaction.customId.startsWith('user-default-deck-bans-')) {
          const queueId = parseInt(interaction.customId.split('-')[4])
          const deckIds = interaction.values.map((id) => parseInt(id))
          await setUserDefaultDeckBans(interaction.user.id, queueId, deckIds)

          // Get deck information to display names
          const deckList = await getDeckList(true)
          const selectedDecks = deckList
            .filter((deck) => deckIds.includes(deck.id))
            .map((deck) => `${deck.deck_emote} ${deck.deck_name}`)

          await interaction.update({
            content: `Successfully set default deck bans:\n${selectedDecks.join('\n')}`,
            components: [],
          })
        }

        if (interaction.customId.startsWith('change-match-winner-')) {
          const matchId = parseInt(interaction.customId.split('-')[3])
          const newWinningTeam = parseInt(interaction.values[0])
          await interaction.deferUpdate()

          try {
            // Set the new winning team
            await setWinningTeam(matchId, newWinningTeam)

            // Re-run endMatch logic to recalculate MMR and update message
            await endMatch(matchId, false)

            await interaction.editReply({})
            await interaction.followUp({
              content: `Successfully changed winner to Team ${newWinningTeam} for Match #${matchId}. MMR has been recalculated.`,
            })
          } catch (err) {
            console.error('Error changing match winner:', err)
            const errorMessage =
              err instanceof Error ? err.message : String(err)
            await interaction.editReply({
              content: `Failed to change match winner.\nError: ${errorMessage}`,
            })
          }
        }
      } catch (err) {
        console.error('Error in select menu interaction:', err)
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              content: 'There was an error processing your selection.',
              flags: MessageFlags.Ephemeral,
            })
          } else {
            await interaction.reply({
              content: 'There was an error processing your selection.',
              flags: MessageFlags.Ephemeral,
            })
          }
        } catch (replyErr) {
          console.error('Failed to send error message:', replyErr)
        }
      }
    }

    // Button interactions
    if (interaction.isButton()) {
      try {
        if (interaction.customId.startsWith('use-default-bans-')) {
          const parts = interaction.customId.split('-')
          const step = parseInt(parts[3])
          const matchId = parseInt(parts[4])
          const startingTeamId = parseInt(parts[5])

          await interaction.deferReply({ flags: MessageFlags.Ephemeral })

          const channel = interaction.channel as TextChannel
          const matchTeams = await getTeamsInMatch(matchId)
          const activeTeamId = (startingTeamId + step) % 2

          // Check if it's the user's turn
          if (
            interaction.user.id !==
            matchTeams.teams[activeTeamId].players[0].user_id
          ) {
            await interaction.followUp({
              content: `It's not your turn to select decks!`,
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          const result = await applyDefaultDeckBansAndAdvance(
            interaction.user.id,
            matchId,
            step,
            startingTeamId,
            channel,
          )

          if (!result) {
            await interaction.followUp({
              content: `You don't have any default deck bans set for this queue. You can set some with </config default-deck-bans:1414248501742669939>.`,
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          await interaction.message.delete()
          await interaction.followUp({
            content: `Applied your default deck bans!`,
            flags: MessageFlags.Ephemeral,
          })
        }

        if (interaction.customId.startsWith('remove-user-deck-bans-')) {
          const queueId = parseInt(interaction.customId.split('-')[4])
          await setUserDefaultDeckBans(interaction.user.id, queueId, [])
          await interaction.update({
            content: `Successfully removed all user deck bans.`,
            components: [],
          })
        }

        // handle tuple veto
        if (interaction.customId.startsWith('veto-tuples-')) {
          console.log('Handling veto tuples')
          const matchId = parseInt(interaction.customId.split('-')[2])
          const queueId = await getQueueIdFromMatch(matchId)
          const matchTeams = await getTeamsInMatch(matchId)
          const matchUsersArray = matchTeams.teams.flatMap((t) =>
            t.players.map((u) => u.user_id),
          )
          const players = await pool.query(
            `SELECT elo, user_id FROM queue_users WHERE user_id = ANY($1)`,
            [matchUsersArray],
          )
          const vetoLimit = await pool.query(
            `SELECT veto_mmr_threshold FROM queues WHERE id = $1`,
            [queueId],
          )
          const userElo = players.rows.find(
            (p) => p.user_id === interaction.user.id,
          )?.elo
          const userInMatch = matchUsersArray.includes(interaction.user.id)
          console.log(userInMatch)
          console.log(matchUsersArray)
          console.log(interaction.user.id)

          // check if player is allowed to veto
          if (
            !(userElo <= vetoLimit.rows[0].veto_mmr_threshold) ||
            !userInMatch
          ) {
            await interaction.reply({
              content: 'You are not allowed to veto.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          // Check if veto already used
          if (tupleVetoUsed.has(matchId)) {
            await interaction.reply({
              content: 'Veto has already been used for this match.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          const embed = interaction.message.embeds[0]
          const veto = async (
            interaction: MessageComponentInteraction | null | undefined,
            { embed }: { embed: EmbedBuilder; votes?: string[] },
          ) => {
            if (!interaction) return

            tupleVetoUsed.add(matchId)
            const queueId = await getQueueIdFromMatch(matchId)

            // Regenerate tuples
            const tupleGen = new TupleBans(queueId, [])
            await tupleGen.init()
            let generatedTuples = tupleGen.getTupleBans(tupleGen.veto)
            // console.table(generatedTuples)

            // Update match tuple bans in DB
            const tupleStrings = generatedTuples.map(
              (t) => `${t.deckId}_${t.stakeId}`,
            )
            await setMatchTupleBans(matchId, tupleStrings)

            const messageComponents = interaction.message.components
            const selectMenuRow = messageComponents.find(
              (row) =>
                row.type === 1 &&
                'components' in row &&
                row.components?.[0]?.type === 3,
            ) as any
            const selectMenu = selectMenuRow?.components?.[0]
            const selectMenuCustomId = selectMenu?.customId || ''
            const selectParts = selectMenuCustomId.split('-')
            const opponentTeamIndex = parseInt(selectParts[4])
            const activeTeamIndex = 1 - opponentTeamIndex

            const activeTeamName =
              matchTeams.teams[activeTeamIndex].players.length === 1
                ? (
                    await client.users.fetch(
                      matchTeams.teams[activeTeamIndex].players[0].user_id,
                    )
                  ).displayName
                : `Team ${matchTeams.teams[activeTeamIndex].id}`

            // Build new embed description
            const tupleListStr = generatedTuples
              .map(
                (t, i) =>
                  `**\`${i + 1}.\`** ${t.deckEmoji} ${t.stakeEmoji} ${t.deckName} / ${t.stakeName}`,
              )
              .join('\n')

            const newEmbed = EmbedBuilder.from(embed as any).setDescription(
              `**${activeTeamName}** bans 1 option.\n\n` +
                `**Available Options:**\n${tupleListStr}`,
            )

            // Build new select menu
            const deckSelMenu = await setupDeckSelect(
              selectMenuCustomId,
              `${activeTeamName}: Select 1 option to ban.`,
              1,
              1,
              true,
              [],
              [],
              queueId,
              undefined,
              generatedTuples,
            )

            // Build new buttons (removing veto button)
            const deckBanButtonsRow = ActionRowBuilder.from(
              interaction.message.components[1] as any,
            ) as ActionRowBuilder<ButtonBuilder>
            const newButtons = deckBanButtonsRow.components.filter(
              (c: any) =>
                !(
                  (c.data && c.data.custom_id?.startsWith('veto-tuples-')) ||
                  (c.customId && c.customId.startsWith('veto-tuples-'))
                ),
            )
            deckBanButtonsRow.setComponents(newButtons)

            await interaction.update({
              embeds: [newEmbed],
              components: [deckSelMenu, deckBanButtonsRow],
            })

            if (interaction.channel?.type === ChannelType.GuildText)
              await interaction.channel?.send(
                `# ${interaction.user} has used their veto!`,
              )
          }
          await veto(interaction, { embed: EmbedBuilder.from(embed) })
        }

        if (interaction.customId.startsWith('reroll-tuples-')) {
          const matchId = parseInt(interaction.customId.split('-')[2])
          const matchTeams = await getTeamsInMatch(matchId)
          const matchUsersArray = matchTeams.teams.flatMap((t) =>
            t.players.map((u) => u.user_id),
          )

          // Check if reroll already used
          if (tupleRerollUsed.has(matchId)) {
            await interaction.reply({
              content: 'Reroll has already been used for this match.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          // todo: make veto button re appear when a re roll is triggered
          // Use handleVoting for reroll
          await handleVoting(interaction, {
            voteType: 'Reroll Votes',
            embedFieldIndex: 0, // Add it as first field if no fields exist
            participants: matchUsersArray,
            matchId: matchId,
            onComplete: async (interaction, { embed }) => {
              if (!interaction) return

              tupleRerollUsed.add(matchId)
              const queueId = await getQueueIdFromMatch(matchId)

              // Regenerate tuples
              const tupleGen = new TupleBans(queueId, [])
              await tupleGen.init()
              const generatedTuples = tupleGen.getTupleBans()

              // Update match tuple bans in DB
              const tupleStrings = generatedTuples.map(
                (t) => `${t.deckId}_${t.stakeId}`,
              )
              await setMatchTupleBans(matchId, tupleStrings)

              const messageComponents = interaction.message.components
              const selectMenuRow = messageComponents.find(
                (row) =>
                  row.type === 1 &&
                  'components' in row &&
                  row.components?.[0]?.type === 3,
              ) as any
              const selectMenu = selectMenuRow?.components?.[0]
              const selectMenuCustomId = selectMenu?.customId || ''
              const selectParts = selectMenuCustomId.split('-')
              const opponentTeamIndex = parseInt(selectParts[4])
              const activeTeamIndex = 1 - opponentTeamIndex

              const activeTeamName =
                matchTeams.teams[activeTeamIndex].players.length === 1
                  ? (
                      await client.users.fetch(
                        matchTeams.teams[activeTeamIndex].players[0].user_id,
                      )
                    ).displayName
                  : `Team ${matchTeams.teams[activeTeamIndex].id}`

              // Build new embed description
              const tupleListStr = generatedTuples
                .map(
                  (t, i) =>
                    `**\`${i + 1}.\`** ${t.deckEmoji} ${t.stakeEmoji} ${t.deckName} / ${t.stakeName}`,
                )
                .join('\n')

              const newEmbed = EmbedBuilder.from(embed as any).setDescription(
                `**${activeTeamName}** bans 1 option.\n\n` +
                  `**Available Options:**\n${tupleListStr}`,
              )

              // Remove the voting field if it was added
              const fields = newEmbed.data.fields || []
              const voteFieldIndex = fields.findIndex(
                (f) => f.name === 'Reroll Votes:',
              )
              if (voteFieldIndex !== -1) {
                fields.splice(voteFieldIndex, 1)
              }

              // Build new select menu
              const deckSelMenu = await setupDeckSelect(
                selectMenuCustomId,
                `${activeTeamName}: Select 1 option to ban.`,
                1,
                1,
                true,
                [],
                [],
                queueId,
                undefined,
                generatedTuples,
              )

              // Build new buttons (removing reroll button)
              const deckBanButtonsRow = ActionRowBuilder.from(
                interaction.message.components[1] as any,
              ) as ActionRowBuilder<ButtonBuilder>
              const newButtons = deckBanButtonsRow.components.filter(
                (c: any) =>
                  !(
                    (c.data &&
                      c.data.custom_id?.startsWith('reroll-tuples-')) ||
                    (c.customId && c.customId.startsWith('reroll-tuples-'))
                  ),
              )
              deckBanButtonsRow.setComponents(newButtons)

              await interaction.update({
                embeds: [newEmbed],
                components: [deckSelMenu, deckBanButtonsRow],
              })
            },
          })
        }

        if (interaction.customId.startsWith('random-deck-select-')) {
          // Format: random-deck-select-{step}-{matchId}-{startingTeamId}-{amount}
          const parts = interaction.customId.split('-')
          const step = parseInt(parts[3])
          const matchId = parseInt(parts[4])
          const startingTeamId = parseInt(parts[5])
          const amount = parseInt(parts[6])

          const channel = interaction.channel as TextChannel
          const matchTeams = await getTeamsInMatch(matchId)
          const activeTeamId = (startingTeamId + step) % 2

          // Get available deck IDs from the select menu in the same message
          const messageComponents = interaction.message.components
          const selectMenuRow = messageComponents.find(
            (row) => 'components' in row && row.components?.[0]?.type === 3,
          )

          // Check if this is tuple format (contains underscore)
          let remainingTuples: string[] | undefined
          let availableValues: string[] = []
          if (
            selectMenuRow &&
            'components' in selectMenuRow &&
            selectMenuRow.components?.[0]
          ) {
            const selectMenu = selectMenuRow.components[0] as any
            availableValues = selectMenu.options.map((opt: any) => opt.value)
            if (
              availableValues.length > 0 &&
              availableValues[0].includes('_')
            ) {
              remainingTuples = availableValues
            }
          }

          // For non-tuple bans, defer as ephemeral reply.
          // For tuple bans, don't defer — advanceDeckBanStep will deferUpdate() and delete/resend.
          if (!remainingTuples) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
          }

          // Check if it's the user's turn
          if (
            interaction.user.id !==
            matchTeams.teams[activeTeamId].players[0].user_id
          ) {
            if (remainingTuples) {
              await interaction.reply({
                content: `It's not your turn to select decks!`,
                flags: MessageFlags.Ephemeral,
              })
            } else {
              await interaction.followUp({
                content: `It's not your turn to select decks!`,
                flags: MessageFlags.Ephemeral,
              })
            }
            return
          }

          if (availableValues.length === 0) {
            if (remainingTuples) {
              await interaction.reply({
                content: `Could not find deck selection menu.`,
                flags: MessageFlags.Ephemeral,
              })
            } else {
              await interaction.followUp({
                content: `Could not find deck selection menu.`,
                flags: MessageFlags.Ephemeral,
              })
            }
            return
          }

          // Randomly select from available options
          const shuffled = [...availableValues].sort(() => Math.random() - 0.5)
          const selectedValues = shuffled.slice(
            0,
            Math.min(amount, shuffled.length),
          )

          // advanceDeckBanStep will deferUpdate(), delete, and resend for tuple bans
          await advanceDeckBanStep(
            selectedValues,
            step,
            matchId,
            startingTeamId,
            channel,
            remainingTuples,
            remainingTuples ? interaction : undefined,
          )

          if (!remainingTuples) {
            await interaction.message.delete()
          }
          await interaction.followUp({
            content: `🎲 Randomly selected ${selectedValues.length} option${selectedValues.length > 1 ? 's' : ''}!`,
            flags: MessageFlags.Ephemeral,
          })
        }

        if (interaction.customId.startsWith('view-stats-')) {
          try {
            await interaction.deferReply()
            const queueName = interaction.customId.split('-')[2]
            const queueId = await getQueueIdFromName(queueName)
            const season = await getActiveSeason()
            const playerStats = await getStatsCanvasUserData(
              interaction.user.id,
              queueId,
            )
            const statFile = await drawPlayerStatsCanvas(
              queueName,
              playerStats,
              false,
              season,
            )
            const viewStatsButtons = setupViewStatsButtons(queueName)

            await interaction.editReply({
              files: [statFile],
              components: [viewStatsButtons],
            })
          } catch (err) {
            await interaction.editReply({
              content: `You don't have any stats for this queue.`,
            })
          }
        }

        if (interaction.customId == 'leave-queue') {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral })

          // Get queues user is in before removing them
          const userQueuesBeforeLeave = await getUserQueues(interaction.user.id)

          // Update the user's queue status
          await pool.query(
            `
              UPDATE queue_users
              SET queue_join_time = NULL
              WHERE user_id = $1
            `,
            [interaction.user.id],
          )

          await resetAllCurrentEloRangeForUser(interaction.user.id)

          // Send webhook notification for each queue left
          // Just do the first queue listed, multi-queue support later
          sendWebhook('LEAVE_QUEUE', {
            players_removed: [{ id: interaction.user.id }],
            queueId: userQueuesBeforeLeave[0].id,
          })

          let message = 'You left the queue!'

          try {
            // Check if user was added to a match during the race condition
            const inMatch = await userInMatch(interaction.user.id)

            if (inMatch) {
              message = `You're in a match, so you aren't in queue.\n(If you don't see your match, please wait a moment, it is being created.)`
            }
          } catch (err) {
            message = `You're in a match, so you aren't in queue.\n(If you don't see your match, please wait a moment, it is being created.)`
          }

          const reply = await interaction.editReply({
            content: message,
          })

          await updateQueueMessage()

          // Delete the message after 10 seconds
          setTimeout(async () => {
            await interaction.deleteReply(reply.id).catch(() => {})
          }, 10000)
        }

        if (interaction.customId === 'check-queued') {
          const userQueueList = await getUserQueues(interaction.user.id)
          // const priorityQueueId = await getUserPriorityQueueId(
          //   interaction.user.id,
          // )

          if (userQueueList.length > 0) {
            const timeSpent = await timeSpentInQueue(
              interaction.user.id,
              userQueueList[0].id,
            )
            await interaction.reply({
              content:
                `
                        You are in queue for **${userQueueList.map((queue) => `${queue.queue_name}`).join(', ')}**!` +
                // `${priorityQueueId ? `\nYour priority queue is **${(await getQueueSettings(priorityQueueId, ['queue_name'])).queue_name}**!` : ``}` +
                `\nJoined queue ${timeSpent}.`,
              flags: MessageFlags.Ephemeral,
            })
          } else {
            await interaction.reply({
              content: `You are not currently in any queues.`,
              flags: MessageFlags.Ephemeral,
            })
          }
        }

        if (interaction.customId === 'set-priority-queue') {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral })
          const queueList = await getActiveQueues()

          const options: StringSelectMenuOptionBuilder[] = queueList.map(
            (queue) => {
              return new StringSelectMenuOptionBuilder()
                .setLabel(queue.queue_name.slice(0, 100))
                .setDescription((queue.queue_desc || '').slice(0, 100))
                .setValue(queue.id.toString())
            },
          )

          options.unshift(
            new StringSelectMenuOptionBuilder()
              .setLabel('Remove Priority Queue')
              .setDescription('Select to have no priority queue.')
              .setValue('-1'),
          )

          if (options.length == 0) return

          const selectRow =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`priority-queue-sel`)
                .setPlaceholder('Select a priority queue!')
                .addOptions(options),
            )

          await interaction.editReply({
            content:
              `Please select the queue you would like to mark as priority.` +
              `\nThis will make the matcmaking queue prioritize a match with this queue when joining more than one queue.`,
            components: [selectRow],
          })
        }

        if (interaction.customId.startsWith('cancel-')) {
          const matchId = parseInt(interaction.customId.split('-')[1])
          const botSettings = await getSettings()
          const member = interaction.member as GuildMember

          const matchUsers = await getTeamsInMatch(matchId)
          const matchUsersArray = matchUsers.teams.flatMap((t) =>
            t.players.map((u) => u.user_id),
          )

          async function cancel(
            interaction: any,
            matchId: number,
            log: boolean = false,
          ) {
            try {
              if (interaction.message && !log) {
                await interaction
                  .update({
                    content: 'The match has been cancelled.',
                    embeds: [],
                    // components: [],
                  })
                  .catch((err: any) => {
                    console.log(err)
                  })
              }
              await endMatch(matchId, true)
            } catch (err) {
              console.error('Error in finishing match:', err)
            }
          }

          // Check if helper clicked the button
          if (member) {
            if (
              (member.roles.cache.has(botSettings.helper_role_id) ||
                member.roles.cache.has(botSettings.queue_helper_role_id)) &&
              !matchUsersArray.includes(interaction.user.id)
            )
              await cancel(interaction, matchId)
          }

          // Check if log channel is the channel
          if (interaction.channel!.id == botSettings.queue_logs_channel_id) {
            await cancel(interaction, matchId, true)
          }

          // Otherwise do normal vote
          try {
            await handleVoting(interaction, {
              voteType: 'Cancel Match Votes',
              embedFieldIndex: 2,
              participants: matchUsersArray,
              matchId: matchId,
              onComplete: async (interaction) => {
                await cancel(interaction, matchId)
              },
            })
          } catch (err) {
            console.error(err)
          }
        }

        if (interaction.customId.startsWith('call-helpers-')) {
          const matchId = parseInt(interaction.customId.split('-')[2])
          const matchChannel = await getMatchChannel(matchId)
          const helperRoleId = await getHelperRoleId()

          // Check if helpers already have access
          if (helperRoleId && matchChannel) {
            const helperRole =
              await interaction.guild?.roles.fetch(helperRoleId)
            if (helperRole) {
              const existingPermissions =
                matchChannel.permissionOverwrites.cache.get(helperRole.id)
              if (
                existingPermissions &&
                existingPermissions.allow.has(PermissionFlagsBits.ViewChannel)
              ) {
                await interaction.reply({
                  content: 'Helpers are already in this match.',
                  flags: MessageFlags.Ephemeral,
                })
                return
              }
            }
          }

          // Show confirmation message
          const confirmRow =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`helpers-confirm-${matchId}`)
                .setLabel('Yes, Call Helpers')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId(`helpers-cancel-${matchId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary),
            )

          await interaction.reply({
            content:
              'Are you sure you want to call helpers into this match?\nIf your opponent is AFK, please do not call helpers until 5 minutes after the lobby has been made.',
            components: [confirmRow],
            flags: MessageFlags.Ephemeral,
          })
        }

        if (interaction.customId.startsWith('helpers-confirm')) {
          const matchId = parseInt(interaction.customId.split('-')[2])
          const matchChannel = await getMatchChannel(matchId)
          const helperRoleId = await getHelperRoleId()
          if (helperRoleId && matchChannel) {
            const helperRole =
              await interaction.guild?.roles.fetch(helperRoleId)
            if (helperRole) {
              await matchChannel.permissionOverwrites.edit(helperRole.id, {
                ViewChannel: true,
                SendMessages: true,
              })

              await matchChannel.send(
                `<@&1352125716367540224> have been called into this queue by <@${interaction.user.id}>!`,
              )

              await interaction.deferUpdate()
              await interaction.deleteReply()
            }
          }
        }

        if (interaction.customId.startsWith('helpers-cancel-')) {
          await interaction.deferUpdate()
          await interaction.deleteReply()
        }

        if (interaction.customId.startsWith('contest-confirm-')) {
          const parts = interaction.customId.split('-')
          const matchId = parseInt(parts[2])
          const messageId = parts[3]
          const botSettings = await getSettings()

          const helperRole = await interaction.guild!.roles.fetch(
            botSettings.helper_role_id,
          )
          const queueHelperRole = await interaction.guild!.roles.fetch(
            botSettings.queue_helper_role_id,
          )

          const contestChannel = await interaction.guild!.channels.create({
            name: `contest-match-${matchId}`,
            permissionOverwrites: [
              {
                id: interaction.guild!.id,
                deny: [PermissionFlagsBits.ViewChannel],
              },
              {
                id: interaction.user.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                ],
              },
              ...(helperRole
                ? [
                    {
                      id: helperRole.id,
                      allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                      ],
                    },
                  ]
                : []),
              ...(queueHelperRole
                ? [
                    {
                      id: queueHelperRole.id,
                      allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                      ],
                    },
                  ]
                : []),
            ],
          })

          if (!contestChannel.isTextBased()) {
            await interaction.update({
              content: 'Failed to create contest channel.',
              components: [],
            })
            return
          }

          await contestChannel.send({
            content: `<@&${helperRole!.id}>\n<@${interaction.user.id}> wants to contest the results of **Match #${matchId}**.`,
          })

          // Fetch the original results message and forward the embed
          try {
            const originalMessage =
              await interaction.channel?.messages.fetch(messageId)
            if (originalMessage?.embeds.length) {
              await contestChannel.send({
                embeds: [originalMessage.embeds[0]],
              })
            }
          } catch (err) {
            console.error('Failed to fetch original message embed:', err)
          }

          // Add delete button for helpers
          const deleteButtonRow =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`delete-contest-${matchId}`)
                .setLabel('Delete Contest Channel')
                .setStyle(ButtonStyle.Danger),
            )

          await contestChannel.send({
            content: 'Helpers can delete this contest channel when resolved:',
            components: [deleteButtonRow],
          })

          await interaction.update({
            content: `Contest channel created! Please go here to contest this matchup with the staff: ${contestChannel}`,
            components: [],
          })
        }

        if (interaction.customId.startsWith('contest-cancel-')) {
          await interaction.deferUpdate()
          await interaction.deleteReply()
        }

        if (interaction.customId.startsWith('delete-contest-')) {
          const matchId = parseInt(interaction.customId.split('-')[2])
          const botSettings = await getSettings()
          const member = interaction.member as GuildMember

          // Check if user is a helper
          if (
            member &&
            (member.roles.cache.has(botSettings.helper_role_id) ||
              member.roles.cache.has(botSettings.queue_helper_role_id))
          ) {
            // User is a helper, delete the channel
            await interaction.reply({
              content: 'Deleting contest channel...',
              flags: MessageFlags.Ephemeral,
            })

            try {
              await interaction.channel?.delete()
            } catch (err) {
              console.error(
                `Failed to delete contest channel for match ${matchId}:`,
                err,
              )
            }
          } else {
            // User is not a helper
            await interaction.reply({
              content: 'Only helpers can delete contest channels.',
              flags: MessageFlags.Ephemeral,
            })
          }
        }

        if (interaction.customId.startsWith('rematch-')) {
          const matchId = parseInt(interaction.customId.split('-')[1])
          const matchData = await getMatchData(matchId)
          const matchUsers = await getTeamsInMatch(matchId)
          const matchUsersArray = matchUsers.teams.flatMap((t) =>
            t.players.map((u) => u.user_id),
          )

          if (!matchUsersArray.includes(interaction.user.id)) {
            await interaction.reply({
              content: 'You are not allowed to vote for a rematch.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          const currentVote = await getUserVote(matchId, interaction.user.id)
          if (currentVote && currentVote.vote_type === 'Rematch Votes') {
            await removeUserVote(matchId, interaction.user.id)
          } else {
            await setUserVote(matchId, interaction.user.id, 'Rematch Votes')
          }

          const votes = await getVotesForMatch(matchId, 'Rematch Votes')

          if (votes.length === matchUsersArray.length) {
            const textDisplay = new TextDisplayBuilder().setContent(
              'A Rematch for this matchup has begun!',
            )

            await interaction.update({
              components: [textDisplay],
              flags: MessageFlags.IsComponentsV2,
              allowedMentions: { parse: [] },
            })
            await createMatch(matchUsersArray, matchData.queue_id)
          } else {
            // Update the container to show vote progress
            const rawComponents = interaction.message.components.map((c) =>
              c.toJSON(),
            )
            const container = rawComponents[0] as any
            if (container?.components) {
              const voteText =
                votes.length > 0
                  ? `**Rematch Votes:** ${votes.map((v) => `<@${v}>`).join(', ')} (${votes.length}/${matchUsersArray.length})`
                  : ''

              // Find existing vote text display
              const existingVoteIndex = container.components.findIndex(
                (c: any) =>
                  c.type === 10 && c.content?.startsWith('**Rematch Votes:**'),
              )

              if (existingVoteIndex !== -1) {
                if (voteText) {
                  container.components[existingVoteIndex].content = voteText
                } else {
                  container.components.splice(existingVoteIndex, 1)
                }
              } else if (voteText) {
                // Insert before the last separator + action row
                const lastActionRowIndex = container.components.findLastIndex(
                  (c: any) => c.type === 1,
                )
                if (lastActionRowIndex !== -1) {
                  container.components.splice(lastActionRowIndex, 0, {
                    type: 10,
                    content: voteText,
                  })
                }
              }
            }

            await interaction.update({
              components: rawComponents,
              flags: MessageFlags.IsComponentsV2,
            })
          }
        }

        if (interaction.customId.startsWith('match-contest-')) {
          const matchId = parseInt(interaction.customId.split('-')[2])

          // Check if user was in the match
          const matchUsers = await getTeamsInMatch(matchId)
          const matchUsersArray = matchUsers.teams.flatMap((t) =>
            t.players.map((u) => u.user_id),
          )

          if (!matchUsersArray.includes(interaction.user.id)) {
            await interaction.reply({
              content: 'You cannot contest a match you were not part of.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          // Show confirmation message, including the message ID in the custom ID
          const messageId = interaction.message.id
          const confirmRow =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`contest-confirm-${matchId}-${messageId}`)
                .setLabel('Yes, Contest Match')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId(`contest-cancel-${matchId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary),
            )

          await interaction.reply({
            content:
              'Are you sure you want to contest this match? This will create a channel and alert staff members.',
            components: [confirmRow],
            flags: MessageFlags.Ephemeral,
          })
        }

        if (interaction.customId.startsWith('bo-vote-')) {
          const parts = interaction.customId.split('-') // bo-vote-N-matchId
          const bestOf = parseInt(parts[2], 10) as 3 | 5
          const matchId = parseInt(parts[3], 10)

          const matchUsers = await getTeamsInMatch(matchId)
          const matchUsersArray = matchUsers.teams.flatMap((t) =>
            t.players.map((u) => u.user_id),
          )

          const embed = interaction.message.embeds[0]
          const fields = embed.data.fields || []
          const voteFieldName =
            bestOf === 3 ? 'Best of 3 Votes' : 'Best of 5 Votes'
          if (!fields.find((f) => f.name === voteFieldName)) {
            fields.push({ name: voteFieldName, value: '-', inline: false })
          }

          await handleVoting(interaction, {
            voteType: voteFieldName,
            embedFieldIndex: 3,
            participants: matchUsersArray,
            matchId: matchId,
            onComplete: async (interaction, { embed }) => {
              if (!interaction) return
              const rows = interaction.message.components.map((row) =>
                ActionRowBuilder.from(row as any),
              ) as ActionRowBuilder<ButtonBuilder>[]

              if (bestOf === 3) {
                rows[1].components[2] = new ButtonBuilder()
                  .setLabel('Vote BO5')
                  .setCustomId(`bo-vote-5-${matchId}`)
                  .setStyle(ButtonStyle.Success)
              } else {
                const bo5Button = rows[1].components[2] as ButtonBuilder
                rows[1].components[2] =
                  ButtonBuilder.from(bo5Button).setDisabled(true)
              }

              await setMatchBestOf(matchId, bestOf)

              // Initialize per-team score only on the MMR line (same for both)
              const fields = embed.data.fields || []
              for (let i = 0; i < Math.min(2, fields.length); i++) {
                const val = fields[i].value || ''
                const lines = val.split('\n')
                const mmrIdx = lines.findIndex((l) => l.includes('MMR'))
                if (mmrIdx !== -1) {
                  lines[mmrIdx] = lines[mmrIdx].replace(
                    /\s*-?\s*Score:\s*\d+/i,
                    '',
                  )
                  lines[mmrIdx] = `${lines[mmrIdx]} - Score: 0`
                  fields[i].value = lines.join('\n')
                }
              }

              await interaction.update({ embeds: [embed], components: rows })
              if (interaction.channel) {
                await (interaction.channel as TextChannel).send({
                  content:
                    bestOf === 3
                      ? `## This match has been set to a best of 3!`
                      : `## This match has been set to a best of 5!`,
                })
              }
            },
          })
        }

        if (interaction.customId.startsWith('stake-')) {
          const channel = interaction.channel as TextChannel
          const stakeComponentIdx = parseInt(interaction.customId.split('-')[2])
          const matchId = parseInt(interaction.customId.split('-')[3])
          const matchTeams = await getTeamsInMatch(matchId)
          const teamVoterId = await getMatchStakeVoteTeam(matchId)
          const teamPlayers = matchTeams.teams[teamVoterId].players.filter(
            (user) => user.user_id === interaction.user.id,
          )

          if (teamPlayers.length == 0) {
            return interaction.reply({
              content: "It's not your turn to ban stakes.",
              flags: [MessageFlags.Ephemeral],
            })
          }

          await setMatchStakeVoteTeam(matchId, 1 - teamVoterId)
          const rows = interaction.message.components.map((row) =>
            ActionRowBuilder.from(row as any),
          ) as ActionRowBuilder<ButtonBuilder>[]

          const stakeButton = rows[0].components[
            stakeComponentIdx
          ] as ButtonBuilder
          rows[0].components[stakeComponentIdx] =
            ButtonBuilder.from(stakeButton).setDisabled(true)

          const enabledButtons = rows[0].components.filter(
            (c) => !(c as ButtonBuilder).data.disabled,
          )

          // If only one left enabled, announce it
          if (enabledButtons.length === 1) {
            const lastEnabled = enabledButtons[0] as any
            const stakeData = await getStake(
              parseInt(lastEnabled.data.custom_id.split('-')[1]),
            )
            if (stakeData) {
              await setPickedMatchStake(matchId, stakeData.stake_name, true)
              await interaction.message.delete()
              await channel.send({
                content: `## Selected Stake: ${stakeData.stake_emote} ${stakeData.stake_name} `,
              })
            }
          } else {
            const stakeButton = rows[0].components[
              stakeComponentIdx
            ] as ButtonBuilder
            rows[0].components[stakeComponentIdx] =
              ButtonBuilder.from(stakeButton).setDisabled(true)
            await interaction.message.delete()
            const nextTeamUsers = matchTeams.teams[1 - teamVoterId].players
              .map((plr) => `<@${plr.user_id}>`)
              .join('\n')
            await channel.send({
              content: `**Stake Bans:**\n${nextTeamUsers}`,
              components: rows,
            })
          }
        }

        if (interaction.customId == 'veto-stake') {
          const channel = interaction.channel as TextChannel
          const matchId = await getMatchIdFromChannel(channel.id)
          if (!matchId) return
          const queueId = await getQueueIdFromMatch(matchId)
          if (!queueId) return

          const queueUserMmr = await getPlayerElo(interaction.user.id, queueId)
          if (!queueUserMmr) return
          const queueSettings = await getQueueSettings(queueId)
          if (!queueSettings.veto_mmr_threshold) return

          if (queueUserMmr > queueSettings.veto_mmr_threshold) {
            await interaction.reply({
              content: `You are not allowed to veto because you are above **${queueSettings.veto_mmr_threshold} MMR**.`,
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          await interaction.message.delete()

          const stakeData = await getStakeByName('White Stake')
          if (stakeData) {
            await setPickedMatchStake(matchId, stakeData.stake_name, true)
            await channel.send({
              content: `## VETO: ${stakeData.stake_emote} ${stakeData.stake_name} `,
            })
          }
        }

        if (interaction.customId.startsWith('accept-party-invite-')) {
          const memberId = interaction.customId.split('-').pop() // id of the user who sent the invite
          if (!memberId) {
            // should never happen
            await interaction.reply({
              content: 'Invalid invite.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          const client = interaction.client
          const guild =
            client.guilds.cache.get(process.env.GUILD_ID!) ??
            (await client.guilds.fetch(process.env.GUILD_ID!))

          const member = await guild.members.fetch(memberId)
          if (!member) {
            // should never happen
            await interaction.reply({
              content: 'Member not found.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          const partyId = await partyUtils.getUserParty(member.user.id) // get party id
          const sendTime = interaction.message.createdTimestamp
          const currentTime = Date.now()
          if (
            currentTime - sendTime > 5 * 60 * 1000 || // greater than 5 minutes
            !partyId
          ) {
            // if party no longer exists
            await interaction.reply({
              content: 'This invite has expired.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          await pool.query(
            `UPDATE users SET joined_party_id = $1 WHERE user_id = $2`,
            [partyId, interaction.user.id],
          )
          const partyName = await partyUtils.getPartyName(partyId)
          await interaction.reply({
            content: `Joined ${partyName}!`,
            flags: MessageFlags.Ephemeral,
          })
          if (await getUserDmsEnabled(member.user.id)) {
            await member.send({
              content: `**${interaction.user.displayName}** has joined your party!`,
            })
          }
        }
      } catch (err) {
        console.error(err)
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: `There was an error: ${err}`,
            flags: MessageFlags.Ephemeral,
          })
        } else if (interaction.channel) {
          await interaction.reply({
            content: `There was an error: ${err}`,
            flags: MessageFlags.Ephemeral,
          })
        }
      }
    }
  },
}

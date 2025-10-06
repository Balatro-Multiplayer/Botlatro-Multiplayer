// noinspection JSUnusedGlobalSymbols

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  GuildMember,
  Interaction,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from 'discord.js'
import { pool } from '../db'
import {
  updateQueueMessage,
  timeSpentInQueue,
  createMatch,
  joinQueues,
} from '../utils/queueHelpers'
import {
  endMatch,
  getTeamsInMatch,
  setupDeckSelect,
} from '../utils/matchHelpers'
import {
  getActiveQueues,
  getDecksInQueue,
  getHelperRoleId,
  getMatchChannel,
  getMatchData,
  getMatchStakeVoteTeam,
  getQueueIdFromMatch,
  getQueueSettings,
  getStake,
  getStakeByName,
  getUserPriorityQueueId,
  getUserQueues,
  setMatchStakeVoteTeam,
  setPickedMatchDeck,
  setPickedMatchStake,
  setQueueDeckBans,
  setUserPriorityQueue,
  setMatchBestOf,
  userInQueue,
  getSettings,
  partyUtils,
  setWinningTeam,
} from '../utils/queryDB'
import {
  handleTwoPlayerMatchVoting,
  handleVoting,
  getBestOfMatchScores,
} from '../utils/voteHelpers'

export default {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
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
      if (interaction.customId === 'join-queue') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const joinedQueues = await joinQueues(
          interaction,
          interaction.values,
          interaction.user.id,
        )

        await interaction.followUp({
          content:
            joinedQueues.length > 0
              ? `You joined: ${joinedQueues.join(', ')}`
              : 'You left the queue.',
          flags: MessageFlags.Ephemeral,
        })
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

      if (interaction.values[0].includes('winmatch_')) {
        const customSelId = interaction.values[0]
        const matchId = parseInt(customSelId.split('_')[1])
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
            member.roles.cache.has(botSettings.helper_role_id) ||
            member.roles.cache.has(botSettings.queue_helper_role_id)
          ) {
            await setWinningTeam(matchId, winMatchTeamId)
            await endMatch(matchId)
          }
        }

        await handleTwoPlayerMatchVoting(interaction, {
          participants: matchUsersArray,
          onComplete: async (interaction, winner) => {
            const customSelId = interaction.values[0]
            const matchDataParts: string[] = customSelId.split('_')
            const matchId = parseInt(matchDataParts[1])

            // Check if this match is Best of 3 or 5
            const matchDataObj = await getMatchData(matchId)
            const isBo3 = matchDataObj.best_of_3
            const isBo5 = matchDataObj.best_of_5

            if (!isBo3 && !isBo5) {
              await endMatch(matchId)
              return
            }

            const embed = interaction.message.embeds[0]
            const fields = embed.data.fields || []

            // Update Best of scores and check for match winner
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
                  mmrLine.replace(/\s*-?\s*Score:\s*\d+/i, '').trimEnd() +
                  ` - Score: ${score}`
              }

              fields[i].value = cleaned.join('\n')
            }

            const scores = getBestOfMatchScores(fields)
            const requiredWins = isBo5 ? 3 : isBo3 ? 2 : 1
            const [team1Wins, team2Wins] = scores

            let winningTeam = 0
            if (team1Wins >= requiredWins) {
              winningTeam = 1
            } else if (team2Wins >= requiredWins) {
              winningTeam = 2
            }

            if (winningTeam) {
              await endMatch(matchId)
              return
            }

            interaction.message.embeds[0] = embed
            await interaction.update({ embeds: interaction.message.embeds })
          },
        })
      }

      if (interaction.customId.includes('deck-bans-')) {
        const channel = interaction.channel as TextChannel
        const parts = interaction.customId.split('-')
        const step = parseInt(parts[2])
        const matchId = parseInt(parts[3])
        const queueId = await getQueueIdFromMatch(matchId)
        const startingTeamId = parseInt(parts[4])
        const matchTeams = await getTeamsInMatch(matchId)
        const deckOptions = await getDecksInQueue(queueId)
        const queueSettings = await getQueueSettings(queueId)
        const step2Amt = queueSettings.second_deck_ban_num

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

        await interaction.message.delete()

        if (step === 3) {
          const finalDeckPick = deckOptions.find(
            (deck) => deck.id === parseInt(interaction.values[0]),
          )

          if (finalDeckPick) {
            await setPickedMatchDeck(matchId, finalDeckPick.deck_name)
            await channel.send({
              content: `## Selected Deck: ${finalDeckPick.deck_emote} ${finalDeckPick.deck_name}`,
            })
          }
          return
        }

        // Prepare next step
        const nextStep = step + 1
        const nextTeamId = (startingTeamId + nextStep) % 2
        const nextMember = await interaction.client.guilds
          .fetch(process.env.GUILD_ID!)
          .then((g) =>
            g.members.fetch(matchTeams.teams[nextTeamId].players[0].user_id),
          )

        const deckChoices = interaction.values.map((deckId) => parseInt(deckId))

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
          .filter((deck) => interaction.values.includes(`${deck.id}`))
          .map((deck) => `${deck.deck_emote} - ${deck.deck_name}`)

        await channel.send({
          content: `<@${matchTeams.teams[nextTeamId].players[0].user_id}>\n### ${step == 1 ? `Banned Decks:\n` : `Decks Picked:\n`}${deckPicks.join('\n')}`,
          components: [deckSelMenu],
        })
      }

      if (interaction.customId.startsWith('queue-ban-decks-')) {
        const queueId = parseInt(interaction.customId.split('-')[3])
        await setQueueDeckBans(queueId, interaction.values)
        await interaction.update({
          content: 'Successfully changed queue decks that are banned.',
          components: [],
        })
      }
    }

    // Button interactions
    if (interaction.isButton()) {
      try {
        if (interaction.customId == 'leave-queue') {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral })

          const inQueue = await userInQueue(interaction.user.id)
          if (interaction.customId === 'leave-queue' && !inQueue) {
            await interaction.followUp({
              content: `You're not in the queue.`,
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          // Update the user's queue status and join with the queues table based on channel id
          await pool.query(
            `
                      UPDATE queue_users
                      SET queue_join_time = NULL
                      WHERE user_id = $1
                  `,
            [interaction.user.id],
          )

          await updateQueueMessage()
          await interaction.followUp({
            content: `You left the queue!`,
            flags: MessageFlags.Ephemeral,
          })
        }

        if (interaction.customId === 'check-queued') {
          const userQueueList = await getUserQueues(interaction.user.id)
          const priorityQueueId = await getUserPriorityQueueId(
            interaction.user.id,
          )

          if (userQueueList.length > 0) {
            const timeSpent = await timeSpentInQueue(
              interaction.user.id,
              userQueueList[0].id,
            )
            await interaction.reply({
              content:
                `
                        You are in queue for **${userQueueList.map((queue) => `${queue.queue_name}`).join(', ')}**!` +
                `${priorityQueueId ? `\nYour priority queue is **${(await getQueueSettings(priorityQueueId, ['queue_name'])).queue_name}**!` : ``}` +
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

          async function cancel(interaction: any, matchId: number) {
            try {
              await endMatch(matchId, true)
              if (interaction.message) {
                await interaction.update({
                  content: 'The match has been cancelled.',
                  embeds: [],
                  components: [],
                })
              }
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

          // Otherwise do normal vote
          try {
            await handleVoting(interaction, {
              voteType: 'Cancel Match Votes',
              embedFieldIndex: 2,
              participants: matchUsersArray,
              onComplete: async (interaction) => {
                await cancel(interaction, matchId)
              },
              resendOnVote: true,
            })
          } catch (err) {
            console.error(err)
          }
        }

        if (interaction.customId.startsWith('call-helpers-')) {
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
                `<@&${helperRole.id}> have been called into this queue by <@${interaction.user.id}>!`,
              )
              const rows = interaction.message.components.map((row) =>
                ActionRowBuilder.from(row as any),
              ) as ActionRowBuilder<ButtonBuilder>[]

              const helperButton = rows[1].components[1] as ButtonBuilder
              rows[1].components[1] =
                ButtonBuilder.from(helperButton).setDisabled(true)

              await interaction.update({ components: rows })
            }
          }
        }
        if (interaction.customId.startsWith('rematch-')) {
          const matchId = parseInt(interaction.customId.split('-')[1])
          const matchData = await getMatchData(matchId)
          const matchUsers = await getTeamsInMatch(matchId)
          const matchUsersArray = matchUsers.teams.flatMap((t) =>
            t.players.map((u) => u.user_id),
          )

          await handleVoting(interaction, {
            voteType: 'Rematch Votes',
            embedFieldIndex: 2,
            participants: matchUsersArray,
            onComplete: async (interaction, { embed }) => {
              await interaction.update({
                content: 'A Rematch for this matchup has begun!',
                embeds: [embed],
                components: [],
              })
              await createMatch(matchUsersArray, matchData.queue_id)
            },
          })
        }

        if (interaction.customId.startsWith('contest-')) {
          // TODO: Add support for this
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
            resendOnVote: true,
            onComplete: async (interaction, { embed }) => {
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
              await setPickedMatchStake(matchId, stakeData.stake_name)
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
              content: `Stake Bans:\n${nextTeamUsers}`,
              components: rows,
            })
          }
        }

        if (interaction.customId == 'veto-stake') {
          const channel = interaction.channel as TextChannel
          await interaction.message.delete()

          const stakeData = await getStakeByName('White Stake')
          if (stakeData) {
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
          await member.send({
            content: `**${interaction.user.displayName}** has joined your party!`,
          })
        }
      } catch (err) {
        console.error(err)
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error.',
            flags: MessageFlags.Ephemeral,
          })
        } else if (interaction.channel) {
          await interaction.reply({
            content: 'There was an error.',
            flags: MessageFlags.Ephemeral,
          })
        }
      }
    }
  },
}

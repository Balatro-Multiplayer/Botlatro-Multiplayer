// noinspection JSUnusedLocalSymbols

import {
  Embed,
  GuildChannel,
  MessageComponentInteraction,
  MessageFlags,
  StringSelectMenuInteraction,
} from 'discord.js'
import { setLastWinVoteMessage } from '../events/messageCreate'
import { getSettings } from './queryDB'
import { pool } from '../db'

// Database helper functions for votes
async function getMatchIdFromMessage(
  interaction: MessageComponentInteraction | StringSelectMenuInteraction,
): Promise<number | null> {
  if (!interaction.channel) return null
  const result = await pool.query(
    'SELECT id FROM matches WHERE channel_id = $1',
    [interaction.channel.id],
  )
  return result.rows[0]?.id || null
}

async function getUserVote(
  matchId: number,
  userId: string,
): Promise<{ vote_type: string; vote_value: number | null } | null> {
  const result = await pool.query(
    'SELECT vote_type, vote_value FROM votes WHERE match_id = $1 AND user_id = $2',
    [matchId, userId],
  )
  return result.rows[0] || null
}

async function setUserVote(
  matchId: number,
  userId: string,
  voteType: string,
  voteValue: number | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO votes (match_id, user_id, vote_type, vote_value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (match_id, user_id)
     DO UPDATE SET vote_type = $3, vote_value = $4, created_at = NOW()`,
    [matchId, userId, voteType, voteValue],
  )
}

async function removeUserVote(matchId: number, userId: string): Promise<void> {
  await pool.query('DELETE FROM votes WHERE match_id = $1 AND user_id = $2', [
    matchId,
    userId,
  ])
}

async function getVotesForMatch(
  matchId: number,
  voteType: string,
): Promise<string[]> {
  const result = await pool.query(
    'SELECT user_id FROM votes WHERE match_id = $1 AND vote_type = $2',
    [matchId, voteType],
  )
  return result.rows.map((row) => row.user_id)
}

async function getVotesForMatchByTeam(
  matchId: number,
  voteType: string,
): Promise<Map<number, string[]>> {
  const result = await pool.query(
    'SELECT user_id, vote_value FROM votes WHERE match_id = $1 AND vote_type = $2',
    [matchId, voteType],
  )
  const votesByTeam = new Map<number, string[]>()
  for (const row of result.rows) {
    const teamId = row.vote_value
    if (!votesByTeam.has(teamId)) {
      votesByTeam.set(teamId, [])
    }
    votesByTeam.get(teamId)!.push(row.user_id)
  }
  return votesByTeam
}

// Export helper function to check winner from database votes
export async function getWinnerFromVotes(
  matchId: number,
  participants: string[],
): Promise<number | null> {
  const votesByTeam = await getVotesForMatchByTeam(matchId, 'win')

  // Check if all participants voted
  const totalVotes = Array.from(votesByTeam.values()).reduce(
    (sum, votes) => sum + votes.length,
    0,
  )

  if (totalVotes !== participants.length) {
    return null // Not all votes are in
  }

  // Check for majority
  const majority = Math.floor(participants.length / 2) + 1

  for (const [teamId, votes] of votesByTeam.entries()) {
    if (votes.length >= majority) {
      return teamId
    }
  }

  return null // No majority
}

export async function handleVoting(
  interaction: MessageComponentInteraction,
  {
    voteType = 'Votes',
    embedFieldIndex = 2, // which field of the embed holds the votes (for display only)
    participants = [] as string[], // list of user IDs who are allowed to vote
    matchId = null as number | null, // optional match ID (for rematches that don't have a channel)
    resendMessage = true, // whether to resend the message (false for rematches)
    onComplete = async (
      interaction: MessageComponentInteraction | null | undefined,
      extra: { embed: Embed; votes?: string[] },
    ) => {}, // callback when all participants vote
  },
) {
  try {
    if (!interaction) return console.error('no interaction found for voting')
    if (!interaction.message)
      return console.error('No message found in interaction')
    const embed = interaction.message.embeds[0]
    if (!embed) return console.error('No embed found in message')
    const fields = embed.data.fields
    if (!fields) return console.error('No fields found in embed')

    const settings = await getSettings()

    // Get match ID from parameter or look it up from channel
    let resolvedMatchId = matchId
    if (!resolvedMatchId) {
      resolvedMatchId = await getMatchIdFromMessage(interaction)
      if (!resolvedMatchId)
        return console.error('No match found for this channel')
    }

    // Check if user is allowed to vote
    if (participants.length && !participants.includes(interaction.user.id)) {
      try {
        if (!interaction.deferred && !interaction.replied)
          await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        if (interaction.deferred || interaction.replied) {
          return interaction.editReply({
            content: `You are not allowed to vote in this poll.`,
          })
        } else {
          return interaction.reply({
            content: `You are not allowed to vote in this poll.`,
          })
        }
      } catch (err) {
        console.error('Failed to respond to unauthorized voter:', err)
        return
      }
    }

    // Get current user vote from database
    const currentVote = await getUserVote(resolvedMatchId, interaction.user.id)

    // Check if user already voted for this vote type
    if (currentVote && currentVote.vote_type === voteType) {
      // Remove vote
      // todo: make this send a revoke notice
      await removeUserVote(resolvedMatchId, interaction.user.id)

      // Update embed for display
      const votesFromDb = await getVotesForMatch(resolvedMatchId, voteType) // get users who voted for chosen vote type
      const votesMentions = votesFromDb.map((uid) => `<@${uid}>`)

      // Ensure vote field exists
      if (!fields[embedFieldIndex]) {
        fields[embedFieldIndex] = { name: `${voteType}:`, value: '-' }
      }
      fields[embedFieldIndex].value =
        votesMentions.length > 0 ? votesMentions.join('\n') : '-'

      interaction.message.embeds[0] = embed
      try {
        await interaction.update({ embeds: interaction.message.embeds })
      } catch (err) {
        console.error('Failed to update interaction after vote removal:', err)
      }
      return
    }

    // Add/update vote in database
    await setUserVote(resolvedMatchId, interaction.user.id, voteType, null)

    // Get updated votes from database
    const votesFromDb = await getVotesForMatch(resolvedMatchId, voteType)
    const votesMentions = votesFromDb.map((uid) => `<@${uid}>`)

    // Update embed for display
    if (!fields[embedFieldIndex]) {
      fields[embedFieldIndex] = { name: `${voteType}:`, value: '' }
    }
    fields[embedFieldIndex].value = votesMentions.join('\n')

    // Check if voting is complete
    if (participants.length > 0 && votesFromDb.length === participants.length) {
      if (interaction.message) {
        fields.splice(embedFieldIndex, 1)
        interaction.message.embeds[0] = embed

        await onComplete(interaction, { votes: votesMentions, embed })
      }
      return
    }

    // Update embed with new votes
    interaction.message.embeds[0] = embed

    if (resendMessage) {
      try {
        // Acknowledge the interaction first
        await interaction.deferUpdate()

        // Delete the old message and send a new one
        const channel = interaction.channel as GuildChannel
        const components = interaction.message.components
        await interaction.message.delete()

        if (channel && channel.isTextBased()) {
          await channel.send({
            embeds: [embed],
            components: components,
          })
        }
      } catch (err) {
        console.error('Failed to resend voting message:', err)
      }
    } else {
      try {
        // Just update the message in place
        await interaction.update({ embeds: interaction.message.embeds })
      } catch (err) {
        console.error('Failed to update voting message:', err)
      }
    }
  } catch (err) {
    console.error('Error in handleVoting:', err)
  }
}

export async function handleTwoPlayerMatchVoting(
  interaction: StringSelectMenuInteraction,
  {
    participants = [] as string[],
    onComplete = async (
      interaction: StringSelectMenuInteraction,
      winner: number,
    ) => {},
  },
) {
  try {
    const embed = interaction.message.embeds[0]
    if (!embed) return console.error('No embed found in message')
    const fields = embed.data.fields
    if (!fields) return console.error('No fields found in embed')
    if (!interaction)
      return console.error('no interaction found for two player voting')

    const winMatchData: string[] = interaction.values[0].split('_')
    const winMatchTeamId = parseInt(winMatchData[2])
    const matchId = await getMatchIdFromMessage(interaction)
    if (!matchId) return console.error('No match found for this channel')

    // Restrict to allowed voters
    if (participants.length && !participants.includes(interaction.user.id)) {
      try {
        if (!interaction.deferred && !interaction.replied)
          await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        if (interaction.deferred || interaction.replied) {
          return interaction.editReply({
            content: `You are not allowed to vote in this poll.`,
          })
        } else {
          return interaction.reply({
            content: `You are not allowed to vote in this poll.`,
          })
        }
      } catch (err) {
        console.error('Failed to respond to unauthorized voter:', err)
        return
      }
    }

    // Get current user vote from database
    const currentVote = await getUserVote(matchId, interaction.user.id)

    // Check if user already voted for this team
    const userAlreadyVotedForThisTeam =
      currentVote &&
      currentVote.vote_type === 'win' &&
      currentVote.vote_value === winMatchTeamId

    // If user already voted for this team, remove the vote
    if (userAlreadyVotedForThisTeam) {
      await removeUserVote(matchId, interaction.user.id)
    } else {
      // Otherwise, update their vote (this will replace any existing vote)
      await setUserVote(matchId, interaction.user.id, 'win', winMatchTeamId)
    }

    // Get updated votes from database grouped by team
    const votesByTeam = await getVotesForMatchByTeam(matchId, 'win')

    // Update the embed for display
    const voteArray: { team_id: number; votes: string[] }[] = []
    for (let i = 0; i < fields.length; i++) {
      if (
        fields[i].name.includes('Cancel Match') ||
        fields[i].name.includes('Votes')
      )
        continue

      const lines = fields[i].value?.split('\n') || []
      const mmrLine = lines.find((l) => l.includes('MMR')) || ''

      // Get votes for this team from database (teams start at 1, array index starts at 0)
      const teamId = i + 1
      const teamVotes = votesByTeam.get(teamId) || []
      const voteLines = teamVotes.map((uid) => `<@${uid}>`)

      let newValue = mmrLine
      if (voteLines.length > 0) {
        newValue += `\nWin Votes`
        newValue += '\n' + voteLines.join('\n')
      }

      fields[i].value = newValue || '\u200b'
      voteArray.push({ team_id: i, votes: voteLines })
    }

    interaction.message.embeds[0] = embed

    // Check if all participants voted
    const totalVotes = voteArray.reduce(
      (sum, team) => sum + team.votes.length,
      0,
    )
    const allVoted =
      participants.length > 0 && totalVotes === participants.length

    // Check for winner
    let winner: number | undefined
    if (allVoted) {
      const majority = Math.floor(participants.length / 2) + 1
      for (let i = 0; i < voteArray.length; i++) {
        if (voteArray[i].votes.length >= majority) {
          winner = i + 1 // Teams start at 1
        }
      }
    }

    try {
      // Always update the message to show the vote immediately
      await interaction.deferUpdate()

      const channel = interaction.channel as GuildChannel
      const components = interaction.message.components
      await interaction.message.delete()

      if (channel && channel.isTextBased()) {
        const newMessage = await channel.send({
          embeds: [embed],
          components: components,
        })

        setLastWinVoteMessage(channel.id, newMessage.id)
      }

      // AFTER showing the vote, process the winner (this does the heavy work)
      if (winner) {
        await onComplete(interaction, winner)
        return
      }
    } catch (err) {
      console.error('Failed to update voting message:', err)
    }
  } catch (err) {
    const channel = interaction.channel as GuildChannel
    if (channel && channel.isTextBased()) {
      channel.send(
        'Failed to handle voting. Please ping Jeff or Cas about this. Error: ' +
          err,
      )
    } else {
      console.error('Failed to handle voting. Error: ' + err)
    }
  }
}

export function getBestOfMatchScores(
  fields: { name: string; value?: string }[],
): number[] {
  const scores: number[] = [0, 0]
  for (let i = 0; i < Math.min(2, fields.length); i++) {
    const val = fields[i].value || ''
    const lines = val.split('\n')
    const mmrLine = lines.find((l) => l.includes('MMR')) || ''
    const m = mmrLine.match(/Score:\s*(\d+)/i)
    scores[i] = m ? parseInt(m[1], 10) || 0 : 0
  }
  return scores
}

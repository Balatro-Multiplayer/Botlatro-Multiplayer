// noinspection JSUnusedLocalSymbols

import {
  Embed,
  MessageComponentInteraction,
  MessageFlags,
  StringSelectMenuInteraction,
} from 'discord.js'
import { setLastWinVoteMessage } from '../events/messageCreate'
import { getSettings } from './queryDB'

export async function handleVoting(
  interaction: MessageComponentInteraction,
  {
    voteType = 'Votes',
    embedFieldIndex = 2, // which field of the embed holds the votes
    participants = [] as string[], // list of user IDs who are allowed to vote
    onComplete = async (
      interaction: MessageComponentInteraction,
      extra: { embed: Embed; votes?: string[] },
    ) => {}, // callback when all participants vote
  },
) {
  if (!interaction.message)
    return console.error('No message found in interaction')
  const embed = interaction.message.embeds[0]
  if (!embed) return console.error('No embed found in message')
  const fields = embed.data.fields
  if (!fields) return console.error('No fields found in embed')

  const settings = await getSettings()

  // Ensure vote field exists
  if (!fields[embedFieldIndex]) {
    fields[embedFieldIndex] = { name: `${voteType}:`, value: '' }
  } else if (fields[embedFieldIndex].value == '-') {
    fields[embedFieldIndex].value = ''
  }

  const field = fields[embedFieldIndex]
  const votes = field.value
    ? field.value.split('\n').filter((v) => v.trim() !== '' && v.trim() !== '-')
    : []

  // Check if user already voted
  if (votes.includes(`<@${interaction.user.id}>`)) {
    const updatedVotes = votes.filter((v) => v !== `<@${interaction.user.id}>`)
    fields[embedFieldIndex].value = updatedVotes.join('\n')
    if (fields[embedFieldIndex].value == '') fields[embedFieldIndex].value = '-'
    interaction.message.embeds[0] = embed
    await interaction.update({ embeds: interaction.message.embeds })
    return
  }

  // Check if user is allowed to vote
  if (participants.length && !participants.includes(interaction.user.id)) {
    return interaction.reply({
      content: `You are not allowed to vote in this poll.`,
      flags: MessageFlags.Ephemeral,
    })
  }

  // Add vote
  votes.push(`<@${interaction.user.id}>`)
  fields[embedFieldIndex].value = votes.join('\n')

  // Check if voting is complete
  if (participants.length > 0 && votes.length === participants.length) {
    if (interaction.message) {
      fields.splice(embedFieldIndex, 1)
      interaction.message.embeds[0] = embed

      await onComplete(interaction, { votes, embed })
    }
    return
  }

  // Update embed with new votes
  interaction.message.embeds[0] = embed
  await interaction.update({ embeds: interaction.message.embeds })

  if (interaction.channel!.id != settings.queue_results_channel_id) {
    // Send a follow-up message confirming the vote
    await interaction.followUp({
      content: `<@${interaction.user.id}> has voted to end the match.`,
    })
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
  const embed = interaction.message.embeds[0]
  if (!embed) return console.error('No embed found in message')
  const fields = embed.data.fields
  if (!fields) return console.error('No fields found in embed')

  const winMatchData: string[] = interaction.values[0].split('_')
  const winMatchTeamId = parseInt(winMatchData[2])
  const voteArray: { team_id: number; votes: string[] }[] = []
  const userTag = `<@${interaction.user.id}>`

  // Restrict to allowed voters
  if (participants.length && !participants.includes(interaction.user.id)) {
    return interaction.reply({
      content: `You are not allowed to vote in this poll.`,
      flags: MessageFlags.Ephemeral,
    })
  }

  // Check if user already voted for this team
  let userAlreadyVotedForThisTeam = false
  const targetFieldIndex = winMatchTeamId - 1 // Teams start at 1
  if (targetFieldIndex >= 0 && targetFieldIndex < fields.length) {
    const targetField = fields[targetFieldIndex]
    if (
      !targetField.name.includes('Cancel Match') &&
      !targetField.name.includes('Votes')
    ) {
      const targetLines = targetField.value?.split('\n') || []
      const targetVoteLines = targetLines.filter(
        (l) =>
          l.trim() !== '' && !l.includes('MMR') && !l.includes('Win Votes'),
      )
      userAlreadyVotedForThisTeam = targetVoteLines.includes(userTag)
    }
  }

  // Track votes and update the embed
  for (let i = 0; i < fields.length; i++) {
    if (
      fields[i].name.includes('Cancel Match') ||
      fields[i].name.includes('Votes')
    )
      continue

    const lines = fields[i].value?.split('\n') || []

    const mmrLine = lines.find((l) => l.includes('MMR')) || ''
    const voteLines = lines.filter(
      (l) => l.trim() !== '' && !l.includes('MMR') && !l.includes('Win Votes'),
    )

    const idx = voteLines.indexOf(userTag)
    if (idx !== -1) voteLines.splice(idx, 1)

    // Teams start at 1
    // Only add vote if user didn't already vote for this team
    if (winMatchTeamId == i + 1 && !userAlreadyVotedForThisTeam) {
      voteLines.push(userTag)
    }

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
  const totalVotes = voteArray.reduce((sum, team) => sum + team.votes.length, 0)
  const allVoted = participants.length > 0 && totalVotes === participants.length

  if (allVoted) {
    // Check majority
    const majority = Math.floor(participants.length / 2) + 1
    let winner: number | undefined
    for (let i = 0; i < voteArray.length; i++) {
      if (voteArray[i].votes.length >= majority) {
        winner = i + 1 // Teams start at 1
      }
    }

    if (winner) {
      await onComplete(interaction, winner)
      return
    }
  }

  // Update message with the modified embed (including votes)
  await interaction.update({
    embeds: interaction.message.embeds,
    components: interaction.message.components,
  })

  setLastWinVoteMessage(interaction.channel!.id, interaction.message.id)

  // Send a follow-up message confirming the vote (only if vote was added, not removed)
  if (!userAlreadyVotedForThisTeam) {
    await interaction.followUp({
      content: `<@${interaction.user.id}> has voted.`,
    })
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

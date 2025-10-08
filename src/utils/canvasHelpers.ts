import { Canvas, CanvasRenderingContext2D, loadImage } from 'skia-canvas'
import { StatsCanvasPlayerData } from 'psqlDB'
import { client } from 'client'
import { FontLibrary } from 'skia-canvas'
import path from 'path'

const font = 'Capitana'

FontLibrary.use(font, [
  path.join(__dirname, '../fonts', `${font}-Regular.otf`),
  path.join(__dirname, '../fonts', `${font}-Bold.otf`),
])

const config = {
  width: 868,
  height: 677,
  padding: 20,
  colors: {
    background: '#19191a',
    panel: '#282b30',
    gridLines: '#424549',
    textPrimary: '#ffffff',
    textSecondary: '#b0b3b8',
    textTertiary: '#72767d',
    accent: '#4a4e54',
    win: '#00ff38',
    lose: '#ff3636',
    graphLine: '#ff0000',
  },
  fonts: {
    ui: font,
    title: `bold 52px ${font}`,
    value: `bold 44px ${font}`,
    statLabel: `bold 24px ${font}`,
    label: `bold 18px ${font}`,
    small: `bold 20px ${font}`,
    graphSmall: `16px ${font}`,
    percentile: `17px ${font}`,
    gameList: `17px ${font}`,
  },
}

function timeAgo(date: Date) {
  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`
  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`
  return `<1 min ago`
}

function formatNumber(num: number): string {
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return num.toString()
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = config.colors.background
  ctx.fillRect(0, 0, config.width, config.height)

  ctx.fillStyle = config.colors.panel
  ctx.fillRect(0, 0, config.width, 150) // Top panel
  ctx.fillRect(
    config.padding,
    170,
    config.width - 300 - config.padding * 2,
    190,
  ) // Left middle panel
  ctx.fillRect(config.width - 300, 170, config.width - 589, 190) // Right middle panel
  ctx.fillRect(
    config.padding,
    380,
    config.width - config.padding * 2,
    config.height - 400,
  ) // Bottom panel
}

async function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  playerData: StatsCanvasPlayerData,
) {
  const user = await client.users.fetch(playerData.user_id)
  const avatar = await loadImage(user.avatarURL({ extension: 'png' }))

  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(avatar, x, y, size, size)
  ctx.restore()
}

async function drawHeader(
  ctx: CanvasRenderingContext2D,
  playerData: StatsCanvasPlayerData,
  queueName: string,
) {
  const { padding } = config
  const guild =
    client.guilds.cache.get(process.env.GUILD_ID!) ??
    (await client.guilds.fetch(process.env.GUILD_ID!))
  const member = await guild.members.fetch(playerData.user_id)
  const avatarY = (150 - 110) / 2

  await drawAvatar(ctx, padding, avatarY, 110, playerData)

  // Player name and leaderboard position
  ctx.textAlign = 'left'
  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textSecondary
  ctx.fillText(
    playerData.leaderboard_position
      ? `${queueName.toUpperCase()} RANK: #${playerData.leaderboard_position}`
      : `${queueName.toUpperCase()} PLAYER`,
    padding + 128,
    40,
  )

  ctx.font = config.fonts.title
  ctx.fillStyle = config.colors.textPrimary
  ctx.textBaseline = 'middle'
  ctx.fillText(member.displayName, padding + 125, 75)

  // Rank progress bar
  const barHeight = 22
  const barY = 115
  const rankColor = playerData.rank_color || config.colors.textTertiary
  const nextRankColor = playerData.next_rank_color || config.colors.textPrimary
  const rankName = (playerData.rank_name || 'UNRANKED').toUpperCase()

  // Measure rank name width to position bar dynamically
  ctx.font = config.fonts.small
  const rankNameWidth = ctx.measureText(rankName).width
  const rankNameX = padding + 125
  const barX = rankNameX + rankNameWidth + 15 // 15px spacing after rank name
  const barWidth = 260 // Fixed bar width

  if (
    rankName != 'UNRANKED' &&
    playerData.next_rank_mmr &&
    playerData.rank_mmr !== null
  ) {
    // MMR-based ranks: Draw progress bar showing advancement to next rank
    const mmrRange = playerData.next_rank_mmr - playerData.rank_mmr!
    const mmrProgress = playerData.mmr - playerData.rank_mmr!
    const progress = Math.max(0, Math.min(1, mmrProgress / mmrRange))

    ctx.fillStyle = rankColor
    ctx.fillRect(barX, barY, barWidth * progress, barHeight)
    ctx.fillStyle = nextRankColor
    ctx.fillRect(
      barX + barWidth * progress,
      barY,
      barWidth * (1 - progress),
      barHeight,
    )
  } else if (rankName != 'UNRANKED' && playerData.rank_mmr !== null) {
    // Max MMR-based rank - fully filled bar
    ctx.fillStyle = rankColor
    ctx.fillRect(barX, barY, barWidth, barHeight)
  } else if (
    rankName != 'UNRANKED' &&
    playerData.rank_mmr === null &&
    playerData.next_rank_name &&
    playerData.next_rank_position &&
    playerData.rank_position
  ) {
    // Leaderboard-based ranks: Draw progress bar showing advancement to next rank
    const rankRange = playerData.rank_position - playerData.next_rank_position
    const currentPos = playerData.leaderboard_position || 999
    const rankProgress = playerData.rank_position - currentPos
    const progress = Math.max(0, Math.min(1, rankProgress / rankRange))

    ctx.fillStyle = rankColor
    ctx.fillRect(barX, barY, barWidth * progress, barHeight)
    ctx.fillStyle = nextRankColor
    ctx.fillRect(
      barX + barWidth * progress,
      barY,
      barWidth * (1 - progress),
      barHeight,
    )
  } else if (rankName != 'UNRANKED' && playerData.rank_mmr === null) {
    // Max leaderboard rank - fully filled bar
    ctx.fillStyle = rankColor
    ctx.fillRect(barX, barY, barWidth, barHeight)
  }

  // Current rank label
  ctx.fillStyle = rankColor
  ctx.font = config.fonts.small
  ctx.fillText(rankName, rankNameX, barY + barHeight - 12)

  // Next rank label and requirement
  if (playerData.next_rank_name && playerData.next_rank_mmr) {
    // MMR-based next rank
    const mmrNeeded = playerData.next_rank_mmr - playerData.mmr
    ctx.fillStyle = config.colors.textPrimary
    ctx.textAlign = 'left'
    ctx.font = config.fonts.graphSmall

    ctx.letterSpacing = '1px'
    ctx.fillText(
      `+${mmrNeeded.toFixed(1)} MMR`,
      barX + 10,
      barY + barHeight / 2,
    )
    ctx.letterSpacing = '0px'

    ctx.font = config.fonts.small
    ctx.fillStyle = nextRankColor
    ctx.fillText(
      `${playerData.next_rank_name.toUpperCase()}`,
      barX + barWidth + 10,
      barY + barHeight - 12,
    )
  } else if (playerData.next_rank_name && playerData.next_rank_position) {
    // Leaderboard-based next rank
    const nextRankPos = playerData.next_rank_position
    const currentPos = playerData.leaderboard_position || 999
    const positionsNeeded = Math.max(0, currentPos - nextRankPos)

    ctx.fillStyle = config.colors.textPrimary
    ctx.textAlign = 'left'
    ctx.font = config.fonts.graphSmall

    ctx.letterSpacing = '1px'
    ctx.fillText(
      `↑ ${positionsNeeded} ${positionsNeeded === 1 ? 'RANK' : 'RANKS'}`,
      barX + 10,
      barY + barHeight / 2,
    )
    ctx.letterSpacing = '0px'

    ctx.font = config.fonts.small
    ctx.fillStyle = nextRankColor
    ctx.fillText(
      `${playerData.next_rank_name.toUpperCase()}`,
      barX + barWidth + 10,
      barY + barHeight - 12,
    )
  }

  // Current MMR and peak
  ctx.textAlign = 'right'
  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textSecondary
  ctx.fillText('MMR', config.width - padding - 20, 40)

  ctx.font = config.fonts.title
  ctx.fillStyle = config.colors.textPrimary
  ctx.fillText(formatNumber(playerData.mmr), config.width - padding - 20, 80)

  ctx.font = config.fonts.small
  ctx.fillStyle = config.colors.textTertiary
  ctx.fillText(
    `PEAK: ${formatNumber(playerData.peak_mmr)}`,
    config.width - padding - 20,
    barY + barHeight - 12,
  )

  ctx.textAlign = 'left'
}

function drawStats(
  ctx: CanvasRenderingContext2D,
  playerData: StatsCanvasPlayerData,
) {
  const { padding } = config
  const startX = padding
  const startY = 170
  const panelWidth = 450
  const cellWidth = panelWidth / 3.5
  const valueOffsetY = 64

  playerData.stats.forEach((stat, i) => {
    const cx = startX + i * cellWidth + cellWidth / 2
    const y = startY + 35

    ctx.textAlign = 'center'
    ctx.font = config.fonts.statLabel
    ctx.fillStyle = config.colors.textSecondary
    ctx.fillText(stat.label, cx, y)

    ctx.font = config.fonts.value
    ctx.fillStyle = config.colors.textPrimary
    // Format numeric values (but not percentages)
    const displayValue = stat.value.includes('%')
      ? stat.value
      : isNaN(Number(stat.value))
        ? stat.value
        : formatNumber(Number(stat.value))
    ctx.fillText(displayValue, cx, y + valueOffsetY)

    if (stat.percentile !== undefined) {
      ctx.font = config.fonts.percentile
      ctx.fillStyle = config.colors.textSecondary
      const prefix = stat.isTop ? 'TOP' : 'BOTTOM'
      ctx.fillText(`${prefix} ${stat.percentile}%`, cx, y + valueOffsetY + 69)
    }
  })

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
}

function drawPreviousGames(
  ctx: CanvasRenderingContext2D,
  playerData: StatsCanvasPlayerData,
) {
  const statsPanelWidth = 550
  const spacing = 135
  const startX = config.padding + statsPanelWidth + spacing
  const startY = 170
  const panelWidth = config.width - startX - config.padding
  const lineHeight = 22
  const maxGames = 4

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = config.fonts.statLabel
  ctx.fillStyle = config.colors.textSecondary
  ctx.fillText('PREVIOUS GAMES', startX, startY + 35)

  ctx.font = config.fonts.gameList
  ctx.textAlign = 'left'

  // Display up to 4 recent games
  for (let i = 0; i < maxGames; i++) {
    const y = startY + 65 + i * lineHeight

    if (i < playerData.previous_games.length) {
      const game = playerData.previous_games[i]
      const numberText = `${i + 1}.`
      const resultText = game.change > 0 ? 'WIN' : 'LOSS'
      const changeText = `${game.change > 0 ? '+' : ''}${game.change.toFixed(1)}`

      ctx.fillStyle = config.colors.textPrimary
      ctx.fillText(numberText, startX - 120, y)

      ctx.fillStyle = game.change > 0 ? config.colors.win : config.colors.lose
      const numberWidth = ctx.measureText(numberText).width
      ctx.fillText(
        resultText,
        i == 0 ? startX + numberWidth - 112 : startX + numberWidth - 115,
        y,
      )

      const resultWidth = ctx.measureText(resultText).width
      ctx.letterSpacing = '2px'
      ctx.fillText(changeText, startX + resultWidth + numberWidth - 108, y)
      ctx.letterSpacing = '0px'

      ctx.fillStyle = config.colors.textSecondary
      ctx.textAlign = 'right'
      ctx.fillText(timeAgo(new Date(game.time)), startX + panelWidth - 20, y)
      ctx.textAlign = 'left'
    }
  }

  // Current win/loss streak
  const streakY = startY + 80 + maxGames * lineHeight
  ctx.fillStyle = config.colors.textSecondary
  ctx.fillText('CURRENT STREAK: ', startX - 120, streakY)

  ctx.fillStyle =
    playerData.win_streak > 0
      ? config.colors.win
      : playerData.win_streak < 0
        ? config.colors.lose
        : config.colors.textSecondary
  ctx.fillText(`${playerData.win_streak}`, startX + 50, streakY)

  ctx.textBaseline = 'top'
}

function drawGraph(
  ctx: CanvasRenderingContext2D,
  playerData: StatsCanvasPlayerData,
) {
  const { padding } = config
  const area = {
    x: padding + 75,
    y: 395,
    width: config.width - padding * 2 - 100,
    height: config.height - 400 - 50,
  }

  const graphPadding = 4 // Padding for the line within the graph area

  const data = playerData.elo_graph_data
  const dataMinRating =
    data.length > 0 ? Math.min(...data.map((d) => d.rating)) : 0
  const maxRating = playerData.peak_mmr

  ctx.strokeStyle = config.colors.gridLines
  ctx.lineWidth = 1
  ctx.font = config.fonts.graphSmall
  ctx.fillStyle = config.colors.textSecondary
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'

  // Y-axis grid lines and labels
  const targetGridLines = 6
  const tempRange = maxRating - dataMinRating
  const rawInterval = tempRange / targetGridLines
  let niceInterval = 5
  if (rawInterval > 100) niceInterval = 100
  else if (rawInterval > 50) niceInterval = 50
  else if (rawInterval > 25) niceInterval = 25
  else if (rawInterval > 10) niceInterval = 10

  // Start from 0 only if interval is 25 or less
  const startValue =
    niceInterval <= 25
      ? 0
      : Math.floor(dataMinRating / niceInterval) * niceInterval
  const minRating = startValue
  const ratingRange = maxRating - minRating

  for (let value = startValue; value <= maxRating; value += niceInterval) {
    const y =
      area.y + area.height - ((value - minRating) / ratingRange) * area.height
    ctx.beginPath()
    ctx.moveTo(area.x, y)
    ctx.lineTo(area.x + area.width, y)
    ctx.stroke()
    ctx.fillText(value.toString(), area.x - 10, y)
  }

  // Y-axis title
  ctx.save()
  ctx.translate(padding + 15, area.y + area.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.font = config.fonts.label
  ctx.textAlign = 'center'
  ctx.fillText('RATING', 0, 0)
  ctx.restore()

  // X-axis grid lines and labels
  ctx.textAlign = 'center'
  const maxLabels = 15

  data.forEach((_point, i) => {
    // Determine label visibility
    let shouldShowLabel = data.length <= maxLabels
    if (!shouldShowLabel) {
      const gameNumber = i + 1
      const interval = data.length > 100 ? 10 : 5
      shouldShowLabel =
        gameNumber === 1 || (gameNumber % interval === 0 && gameNumber !== 1)
    }

    if (shouldShowLabel) {
      const x = area.x + (i / (data.length - 1)) * area.width

      // Draw grid line only where label is shown
      ctx.beginPath()
      ctx.moveTo(x, area.y)
      ctx.lineTo(x, area.y + area.height)
      ctx.stroke()

      ctx.fillText((i + 1).toString(), x, area.y + area.height + 18)
    }
  })

  // Graph border
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.strokeRect(area.x, area.y, area.width, area.height)

  const shadowOffset = 3

  // Draw shadow (black, transparent, offset)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.lineWidth = 2

  // Shadow lines
  for (let i = 0; i < data.length - 1; i++) {
    const x1 =
      area.x +
      graphPadding +
      (i / (data.length - 1)) * (area.width - graphPadding * 2) +
      shadowOffset
    const y1 =
      area.y +
      graphPadding +
      (area.height - graphPadding * 2) -
      ((data[i].rating - minRating) / ratingRange) *
        (area.height - graphPadding * 2) +
      shadowOffset
    const x2 =
      area.x +
      graphPadding +
      ((i + 1) / (data.length - 1)) * (area.width - graphPadding * 2) +
      shadowOffset
    const y2 =
      area.y +
      graphPadding +
      (area.height - graphPadding * 2) -
      ((data[i + 1].rating - minRating) / ratingRange) *
        (area.height - graphPadding * 2) +
      shadowOffset

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // Shadow points
  data.forEach((point, i) => {
    const x =
      area.x +
      graphPadding +
      (i / (data.length - 1)) * (area.width - graphPadding * 2) +
      shadowOffset
    const y =
      area.y +
      graphPadding +
      (area.height - graphPadding * 2) -
      ((point.rating - minRating) / ratingRange) *
        (area.height - graphPadding * 2) +
      shadowOffset

    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  })

  // Draw actual graph
  ctx.strokeStyle = config.colors.graphLine
  ctx.fillStyle = config.colors.graphLine
  ctx.lineWidth = 2

  // Actual lines
  for (let i = 0; i < data.length - 1; i++) {
    const x1 =
      area.x +
      graphPadding +
      (i / (data.length - 1)) * (area.width - graphPadding * 2)
    const y1 =
      area.y +
      graphPadding +
      (area.height - graphPadding * 2) -
      ((data[i].rating - minRating) / ratingRange) *
        (area.height - graphPadding * 2)
    const x2 =
      area.x +
      graphPadding +
      ((i + 1) / (data.length - 1)) * (area.width - graphPadding * 2)
    const y2 =
      area.y +
      graphPadding +
      (area.height - graphPadding * 2) -
      ((data[i + 1].rating - minRating) / ratingRange) *
        (area.height - graphPadding * 2)

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // Actual points
  data.forEach((point, i) => {
    const x =
      area.x +
      graphPadding +
      (i / (data.length - 1)) * (area.width - graphPadding * 2)
    const y =
      area.y +
      graphPadding +
      (area.height - graphPadding * 2) -
      ((point.rating - minRating) / ratingRange) *
        (area.height - graphPadding * 2)

    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  })
}

export async function drawPlayerStatsCanvas(
  queueName: string,
  playerData: StatsCanvasPlayerData,
) {
  const canvas = new Canvas(config.width, config.height)
  const ctx = canvas.getContext('2d')

  drawBackground(ctx)
  await drawHeader(ctx, playerData, queueName)
  drawStats(ctx, playerData)
  drawPreviousGames(ctx, playerData)
  drawGraph(ctx, playerData)

  return await canvas.png
}

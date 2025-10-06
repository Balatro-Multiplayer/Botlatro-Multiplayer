import { Canvas, CanvasRenderingContext2D, loadImage } from 'skia-canvas'
import { StatsCanvasPlayerData } from 'psqlDB'
import { client } from 'client'
import { FontLibrary } from 'skia-canvas'
import path from 'path'

// --- Configuration & Data ---
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
    win: '#00ff3c',
    lose: '#ff0000',
    graphLine: '#ff0000',
  },
  fonts: {
    ui: font,
    title: `bold 52px ${font}`,
    value: `bold 42px ${font}`,
    stat_label: `bold 24px ${font}`,
    label: `bold 18px ${font}`,
    small: `bold 20px ${font}`,
    graphSmall: `16px ${font}`,
    percentile: `19px ${font}`,
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

// --- Drawing Functions ---

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = config.colors.background
  ctx.fillRect(0, 0, config.width, config.height)

  ctx.fillStyle = config.colors.panel
  // Top panel
  ctx.fillRect(0, 0, config.width, 150)
  // Middle panel
  ctx.fillRect(
    config.padding,
    170,
    config.width - 300 - config.padding * 2,
    190,
  )
  ctx.fillRect(config.width - 300, 170, config.width - 589, 190)
  // Bottom panel
  ctx.fillRect(
    config.padding,
    380,
    config.width - config.padding * 2,
    config.height - 400,
  )
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
) {
  const { padding } = config

  const guild =
    client.guilds.cache.get(process.env.GUILD_ID!) ??
    (await client.guilds.fetch(process.env.GUILD_ID!))

  const member = await guild.members.fetch(playerData.user_id)
  const avatarY = (150 - 110) / 2

  // Avatar
  await drawAvatar(ctx, padding, avatarY, 110, playerData)

  // Player Name
  ctx.textAlign = 'left'
  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textSecondary
  ctx.fillText('RANK: #130', padding + 128, 45)

  ctx.font = config.fonts.title
  ctx.fillStyle = config.colors.textPrimary
  ctx.textBaseline = 'middle'
  ctx.fillText(member.displayName, padding + 125, 80)

  // Rank Bar (dynamic from DB)
  const barHeight = 22
  const barWidth = padding + 120 * 2
  const barX = padding + 195
  const barY = 115
  const rankColor = playerData.rank_color || config.colors.textTertiary
  const rankName = (playerData.rank_name || 'UNRANKED').toUpperCase()

  // draw bar background
  if (rankName != 'UNRANKED') {
    ctx.fillStyle = rankColor
    ctx.fillRect(barX, barY, barWidth, barHeight)
  }

  // rank label
  ctx.fillStyle = rankColor
  ctx.font = config.fonts.small
  ctx.fillText(rankName, padding + 125, barY + barHeight - 12)

  // MMR
  ctx.textAlign = 'right'

  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textSecondary
  ctx.fillText('MMR', config.width - padding - 20, 40)

  ctx.font = config.fonts.title
  ctx.fillStyle = config.colors.textPrimary
  ctx.fillText(playerData.mmr.toString(), config.width - padding - 20, 80)

  ctx.font = config.fonts.small
  ctx.fillStyle = config.colors.textTertiary
  ctx.fillText(
    `BEST: ${playerData.peak_mmr}`,
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

    // Label (centered)
    ctx.textAlign = 'center'
    ctx.font = config.fonts.stat_label
    ctx.fillStyle = config.colors.textSecondary
    ctx.fillText(stat.label, cx, y)

    // Value (centered)
    ctx.font = config.fonts.value
    ctx.fillStyle = config.colors.textPrimary
    ctx.fillText(stat.value, cx, y + valueOffsetY - 5)

    if (stat.percentile !== undefined) {
      ctx.textAlign = 'center'
      ctx.font = config.fonts.percentile
      ctx.fillStyle = config.colors.textSecondary
      ctx.fillText(`TOP ${stat.percentile}%`, cx, y + valueOffsetY + 60)
    }
  })

  // reset text align
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

  // Label
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = config.fonts.stat_label
  ctx.fillStyle = config.colors.textSecondary
  ctx.fillText('PREVIOUS GAMES', startX, startY + 35)

  // Game List
  ctx.font = config.fonts.gameList
  const lineHeight = 22
  const maxGames = 4

  ctx.textAlign = 'left'

  // Display up to 4 previous games
  for (let i = 0; i < maxGames; i++) {
    const y = startY + 65 + i * lineHeight

    if (i < playerData.previous_games.length) {
      const game = playerData.previous_games[i]
      const numberText = `${i + 1}.`
      const resultText = `${game.change > 0 ? 'WIN' : 'LOSS'}`
      const changeText = `${game.change > 0 ? '+' : ''}${game.change}`

      // Number
      ctx.fillStyle = config.colors.textPrimary
      ctx.fillText(numberText, startX - 120, y)

      // Result
      ctx.fillStyle = game.change > 0 ? config.colors.win : config.colors.lose
      const numberWidth = ctx.measureText(numberText).width
      ctx.fillText(resultText, startX + numberWidth - 115, y)

      // Change
      const resultWidth = ctx.measureText(resultText).width
      ctx.fillText(
        changeText.toString(),
        startX + resultWidth + numberWidth - 108,
        y,
      )

      // Time
      ctx.fillStyle = config.colors.textSecondary
      ctx.textAlign = 'right'
      const gameTimeDate = new Date(game.time)
      ctx.fillText(timeAgo(gameTimeDate), startX + panelWidth - 20, y)
      ctx.textAlign = 'left'
    }
  }

  // Always show current streak on the 5th line
  const streakY = startY + 80 + maxGames * lineHeight
  ctx.font = config.fonts.gameList
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

  const data = playerData.elo_graph_data

  // Use exact peak and lowest values for the bounds
  const actualMinRating =
    data.length > 0 ? Math.min(...data.map((d) => d.rating)) : 0
  const actualMaxRating = playerData.peak_mmr

  // Add padding (5% on each side)
  const padding_percentage = 0.05
  const rawRange = actualMaxRating - actualMinRating
  const paddingAmount = rawRange * padding_percentage

  const minRating = actualMinRating - paddingAmount
  const maxRating = actualMaxRating + paddingAmount
  const ratingRange = maxRating - minRating

  // Find nice round numbers for grid lines (multiples of 50)
  const minGridLine = Math.floor(actualMinRating / 50) * 50
  const maxGridLine = Math.ceil(actualMaxRating / 50) * 50

  // --- Draw Grid and Labels ---
  ctx.strokeStyle = config.colors.gridLines
  ctx.lineWidth = 1
  ctx.font = config.fonts.graphSmall
  ctx.fillStyle = config.colors.textSecondary
  ctx.textAlign = 'right'

  // Horizontal grid lines and Y-axis labels (at 50-point intervals)
  ctx.textBaseline = 'middle'
  for (let i = minGridLine; i <= maxGridLine; i += 50) {
    // Only draw grid lines that are within the actual min/max range
    if (i >= actualMinRating && i <= actualMaxRating) {
      const y =
        area.y + area.height - ((i - minRating) / ratingRange) * area.height
      ctx.beginPath()
      ctx.moveTo(area.x, y)
      ctx.lineTo(area.x + area.width, y)
      ctx.stroke()
      ctx.fillText(i.toString(), area.x - 10, y)
    }
  }

  // Draw min/max rating labels at exact positions
  ctx.font = config.fonts.graphSmall

  // Max rating label (top)
  const maxY =
    area.y +
    area.height -
    ((actualMaxRating - minRating) / ratingRange) * area.height
  ctx.fillText(`${Math.round(actualMaxRating)}`, area.x - 10, maxY)

  // Min rating label (bottom)
  const minY =
    area.y +
    area.height -
    ((actualMinRating - minRating) / ratingRange) * area.height
  ctx.fillText(`${Math.round(actualMinRating)}`, area.x - 10, minY)

  // Y-axis Title
  ctx.save()
  ctx.translate(padding + 15, area.y + area.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textSecondary
  ctx.textAlign = 'center'
  ctx.fillText('RATING', 0, 0)
  ctx.restore()

  // Vertical grid lines and X-axis labels
  ctx.textAlign = 'center'
  data.forEach((_point, i) => {
    const x = area.x + (i / (data.length - 1)) * area.width

    ctx.beginPath()
    ctx.moveTo(x, area.y)
    ctx.lineTo(x, area.y + area.height)
    ctx.stroke()

    ctx.font = config.fonts.graphSmall
    ctx.fillStyle = config.colors.textSecondary
    ctx.fillText((i + 1).toString(), x, area.y + area.height + 18)
  })

  // Draw border first (without shadow)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.strokeRect(area.x, area.y, area.width, area.height)

  // Draw the Line and Points with dynamic shadow
  ctx.strokeStyle = config.colors.graphLine
  ctx.fillStyle = config.colors.graphLine
  ctx.lineWidth = 2.5

  // Draw line segments with dynamic shadow based on direction
  for (let i = 0; i < data.length - 1; i++) {
    const x1 = area.x + (i / (data.length - 1)) * area.width
    const y1 =
      area.y +
      area.height -
      ((data[i].rating - minRating) / ratingRange) * area.height
    const x2 = area.x + ((i + 1) / (data.length - 1)) * area.width
    const y2 =
      area.y +
      area.height -
      ((data[i + 1].rating - minRating) / ratingRange) * area.height

    // Calculate direction of the line segment
    const isGoingUp = y2 < y1 // Remember, lower y = higher on canvas
    const isGoingDown = y2 > y1

    // Set shadow based on direction
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = 1

    if (isGoingUp) {
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 2
    } else if (isGoingDown) {
      ctx.shadowOffsetX = -2
      ctx.shadowOffsetY = 2
    } else {
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 2
    }

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // Draw points with shadow on bottom for edge points
  data.forEach((point, i) => {
    const x = area.x + (i / (data.length - 1)) * area.width
    const y =
      area.y +
      area.height -
      ((point.rating - minRating) / ratingRange) * area.height

    // Edge points always have shadow on bottom, middle points follow direction
    let shadowOffsetX = 0
    let shadowOffsetY = 2

    if (i > 0 && i < data.length - 1) {
      const prevY =
        area.y +
        area.height -
        ((data[i - 1].rating - minRating) / ratingRange) * area.height
      const nextY =
        area.y +
        area.height -
        ((data[i + 1].rating - minRating) / ratingRange) * area.height

      // Average direction for middle points
      const avgDirection = (prevY + nextY) / 2
      if (avgDirection < y) {
        // Trend is going up
        shadowOffsetX = 2
        shadowOffsetY = 2
      } else {
        // Trend is going down
        shadowOffsetX = -2
        shadowOffsetY = 2
      }
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = 1
    ctx.shadowOffsetX = shadowOffsetX
    ctx.shadowOffsetY = shadowOffsetY

    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  })

  // Reset shadow for other elements
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

export async function drawPlayerStatsCanvas(playerData: StatsCanvasPlayerData) {
  const canvas = new Canvas(config.width, config.height)
  const ctx = canvas.getContext('2d')

  // Drawing calls in order
  drawBackground(ctx)
  await drawHeader(ctx, playerData)
  drawStats(ctx, playerData)
  drawPreviousGames(ctx, playerData)
  drawGraph(ctx, playerData)

  return await canvas.png
}

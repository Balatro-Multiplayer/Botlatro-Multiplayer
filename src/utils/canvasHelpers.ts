import { Canvas, CanvasRenderingContext2D, loadImage } from 'skia-canvas'
import { StatsCanvasPlayerData } from 'psqlDB'
import { client } from 'client'

// --- Configuration & Data ---
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
    lose: '#f52020',
    graphLine: '#f31919',
  },
  fonts: {
    ui: 'Arial',
    title: 'bold 60px Arial',
    value: 'bold 46px Arial',
    label: 'bold 20px Arial',
    small: '18px Arial',
    percentile: 'bold 16px Arial',
    gameList: 'bold 19px Arial',
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
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return `${seconds} second${seconds !== 1 ? 's' : ''} ago`
}

// --- Drawing Functions ---

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = config.colors.background
  ctx.fillRect(0, 0, config.width, config.height)

  ctx.fillStyle = config.colors.panel
  // Top panel
  ctx.fillRect(0, 0, config.width, 150)
  // Middle panel
  ctx.fillRect(config.padding, 170, config.width - config.padding * 2, 190)
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
  ctx.drawImage(avatar, x, y, size, size)
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

  // Avatar
  await drawAvatar(ctx, padding + 10, 35, 70, playerData)

  // Player Name
  ctx.textAlign = 'left'
  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textSecondary
  ctx.fillText('PLAYER', padding + 98, 45)

  ctx.font = config.fonts.title
  ctx.fillStyle = config.colors.textPrimary
  ctx.textBaseline = 'middle'
  ctx.fillText(member.displayName, padding + 95, 80)

  // Rank Bar (dynamic from DB)
  const barHeight = 22
  const barWidth = padding + 180 * 2
  const barX = padding + 160
  const barY = 115
  const rankColor = playerData.rank_color || config.colors.textTertiary
  const rankName = (playerData.rank_name || 'UNRANKED').toUpperCase()

  // draw bar background
  ctx.fillStyle = rankColor
  ctx.fillRect(barX, barY, barWidth, barHeight)

  // rank label
  ctx.fillStyle = rankColor
  ctx.font = 'bold 18px Arial'
  ctx.fillText(rankName, padding + 95, barY + barHeight - 12)

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
  ctx.fillText(`Best: ${playerData.peak_mmr}`, config.width - padding - 20, 120)

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

  const cellWidth = panelWidth / 4
  const valueOffsetY = 64

  playerData.stats.forEach((stat, i) => {
    const cx = startX + i * cellWidth + cellWidth / 2
    const y = startY + 30

    // Label (centered)
    ctx.textAlign = 'center'
    ctx.font = config.fonts.label
    ctx.fillStyle = config.colors.textSecondary
    ctx.fillText(stat.label, cx, y)

    // Value (centered)
    ctx.font = config.fonts.value
    ctx.fillStyle = config.colors.textPrimary
    ctx.fillText(stat.value, cx, y + valueOffsetY)
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
  const spacing = -10
  const startX = config.padding + statsPanelWidth + spacing
  const startY = 170
  const panelWidth = config.width - startX - config.padding

  // Label
  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textSecondary
  ctx.fillText('PREVIOUS GAMES', startX, startY + 25)

  // Game List
  ctx.font = config.fonts.gameList
  const lineHeight = 22

  playerData.previous_games = playerData.previous_games.filter(
    (game) => game.change !== 0,
  )

  playerData.previous_games.forEach((game, i) => {
    const y = startY + 50 + i * lineHeight
    const numberText = `${i + 1}.`
    const resultText = `${game.change > 0 ? 'WIN' : 'LOSS'}`
    const changeText = game.change

    // Result
    ctx.fillStyle = config.colors.textPrimary
    ctx.fillText(numberText, startX, y)

    // Result
    ctx.fillStyle = game.change > 0 ? config.colors.win : config.colors.lose
    const numberWidth = ctx.measureText(numberText).width
    ctx.fillText(resultText, startX + numberWidth + 5, y)

    // Change
    const resultWidth = ctx.measureText(resultText).width
    ctx.fillText(
      changeText.toString(),
      startX + resultWidth + numberWidth + 13,
      y,
    )

    // Time
    ctx.fillStyle = config.colors.textSecondary
    ctx.textAlign = 'right'
    const gameTimeDate = new Date(game.time)
    ctx.fillText(timeAgo(gameTimeDate), startX + panelWidth - 35, y)
    ctx.textAlign = 'left' // Reset
  })
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
  const maxRating = playerData.peak_mmr

  // --- Draw Grid and Labels ---
  ctx.strokeStyle = config.colors.gridLines
  ctx.lineWidth = 1
  ctx.font = config.fonts.small
  ctx.fillStyle = config.colors.textSecondary
  ctx.textAlign = 'right'

  // Horizontal grid lines and Y-axis labels
  for (let i = 0; i <= maxRating; i += 50) {
    if (i === 0) continue
    const y = area.y + area.height - (i / maxRating) * area.height
    ctx.beginPath()
    ctx.moveTo(area.x, y)
    ctx.lineTo(area.x + area.width, y)
    ctx.stroke()
    ctx.fillText(i.toString(), area.x - 10, y + 4)
  }

  // Y-axis Title
  ctx.save()
  ctx.translate(padding + 5, area.y + area.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textSecondary
  ctx.textAlign = 'center'
  ctx.fillText('RATING', 0, 0)
  ctx.restore()

  // Vertical grid lines and X-axis labels
  ctx.textAlign = 'center'
  data.forEach((point, i) => {
    const x = area.x + (i / (data.length - 1)) * area.width

    ctx.beginPath()
    ctx.moveTo(x, area.y)
    ctx.lineTo(x, area.y + area.height)
    ctx.stroke()

    ctx.font = config.fonts.small
    ctx.fillStyle = config.colors.textSecondary
    ctx.fillText((i + 1).toString(), x, area.y + area.height + 10)
  })

  // Draw the Line and Points
  ctx.strokeStyle = config.colors.graphLine
  ctx.fillStyle = config.colors.graphLine
  ctx.lineWidth = 2.5
  ctx.beginPath()

  data.forEach((point, i) => {
    const x = area.x + (i / (data.length - 1)) * area.width
    const y = area.y + area.height - (point.rating / maxRating) * area.height
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  ctx.stroke()

  // Draw border
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.strokeRect(area.x, area.y, area.width, area.height)

  // Draw points on top of the line
  data.forEach((point, i) => {
    const x = area.x + (i / (data.length - 1)) * area.width
    const y = area.y + area.height - (point.rating / maxRating) * area.height
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  })
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

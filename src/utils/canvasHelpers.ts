import {
  Canvas,
  CanvasRenderingContext2D,
  FontLibrary,
  loadImage,
} from 'skia-canvas'
import { StatsCanvasPlayerData } from 'psqlDB'
import { client, getGuild } from 'client'
import path from 'path'

const bgDir = process.env.ASSETS_DIR || path.join(process.cwd(), 'assets')
const fontDir = process.env.FONTS_DIR || path.join(process.cwd(), 'fonts')

const font = 'm6x11'

FontLibrary.use(font, [path.join(fontDir, `${font}.ttf`)])

const config = {
  width: 800,
  height: 600,
  colors: {
    background: '#3a5055',
    panel: '#1e2b2d',
    gridLines: '#3a5055',
    textPrimary: '#ffffff',
    textSecondary: '#b0b3b8',
    textTertiary: '#ffffffc5',
    textQuaternary: '#000000',
    accent: '#4a4e54',
    win: '#00ff38',
    lose: '#ff3636',
    stone: '#868687',
    pebble: '#b0b3b8',
    steel: '#c3dee0',
    ferrite: '#546e7a',
    gold: '#ffd081',
    pyrite: '#ffd081',
    lucky: '#ffefc4',
    clover: '#2ecc71',
    glass: '#7debf3',
    crystal: '#3498db',
    chips: '#0093FF',
    mult: '#FF4C40',
  },
  fonts: {
    ui: font,
    title: `bold 52px ${font}`,
    statLabel: `bold 44px ${font}`,
    prevgameLabel: `bold 24px ${font}`,
    label: `bold 18px ${font}`,
    small: `bold 20px ${font}`,
    tiny: `16px ${font}`,
    mini: `12px ${font}`,
    gameList: `20px ${font}`,
  },
  eloSplits: [230, 320, 460, 620],
  smallworldEloSplits: [225, 325, 425, 550],
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

async function addTopText(
  ctx: CanvasRenderingContext2D,
  playerData: StatsCanvasPlayerData,
  queueName: string,
) {
  const guild = await getGuild()
  const member = await guild.members.fetch(playerData.user_id).catch(() => null)
  const user = await client.users.fetch(playerData.user_id)

  // Player leaderboard position
  ctx.textAlign = 'left'
  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textTertiary
  ctx.fillText(
    playerData.leaderboard_position
      ? `${queueName.toUpperCase()}: #${playerData.leaderboard_position}`
      : `${queueName.toUpperCase()} PLAYER`,
    190,
    65,
  )

  // Player name with dynamic font sizing
  const displayName = !member ? user.username : member.displayName
  const nameStartX = 190
  const nameMaxWidth = 360
  const nameFontStack = `"${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`
  // Start with the default title font size (62px)
  let nameFontSize = 62
  ctx.font = `bold ${nameFontSize}px ${nameFontStack}`
  let nameWidth = ctx.measureText(displayName).width
  // Scale down if name is too wide
  if (nameWidth > nameMaxWidth) {
    nameFontSize = Math.max(
      32,
      Math.floor((nameMaxWidth / nameWidth) * nameFontSize),
    )
    ctx.font = `bold ${nameFontSize}px ${nameFontStack}`
  }
  //add player name to canvas
  ctx.fillStyle = config.colors.textPrimary
  ctx.textBaseline = 'middle'
  ctx.fillText(displayName, nameStartX, 105)

  // Current MMR and peak
  ctx.textAlign = 'right'
  ctx.font = config.fonts.title
  ctx.fillStyle = config.colors.textPrimary
  ctx.font = `bold ${62}px ${font}`
  ctx.fillText(`${playerData.mmr}`, 735, 105)

  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textTertiary
  //ctx.fillText(`PEAK: ${playerData.peak_mmr}`, 733, 65)
  ctx.fillText(`MMR`, 733, 65)

  ctx.textAlign = 'left'
  ctx.font = config.fonts.label
  ctx.fillStyle = config.colors.textTertiary
  //ctx.fillText('MMR', 585, 65)
}

async function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  playerData: StatsCanvasPlayerData,
) {
  const user = await client.users.fetch(playerData.user_id)
  const avatar = await loadImage(user.displayAvatarURL({ extension: 'png' }))

  //drawCircle(ctx,x + size/2,y + size/2, size/11 * 6,"#47746C")

  ctx.imageSmoothingEnabled = true
  ctx.save()
  ctx.drawImage(avatar, x, y, size, size)
  ctx.restore()
  ctx.imageSmoothingEnabled = false

  //hide corners
  const tl = await loadImage(path.join(bgDir, 'hideTL.png'))
  const tr = await loadImage(path.join(bgDir, 'hideTR.png'))
  const bl = await loadImage(path.join(bgDir, 'hideBL.png'))
  const br = await loadImage(path.join(bgDir, 'hideBR.png'))

  //shadow
  ctx.fillStyle = '#1E2E32'
  ctx.fillRect(x - 2, y + 20, 2, size - 30)

  ctx.fillRect(x + 16, y + size, size - 36, 6)

  //fill corners
  ctx.drawImage(tl, x, y)
  ctx.drawImage(tr, x + size - 16, y)
  ctx.drawImage(bl, x, y + size - 16)
  ctx.drawImage(br, x + size - 22, y + size - 16)
}

async function drawCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

async function addBackground(
  ctx: CanvasRenderingContext2D,
  filename: string = 'bgMain.png',
) {
  const bg = await loadImage(path.join(bgDir, 'backgrounds', filename))
  ctx.drawImage(bg, 0, 0)
}

function drawBoxCorners(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tl: any,
  tr: any,
  bl: any,
  br: any,
  xlen: number,
  ylen: number,
) {
  //corners
  ctx.drawImage(tl, x - 2, y)
  ctx.drawImage(tr, x + xlen - 14, y)
  ctx.drawImage(bl, x - 2, y + ylen - 14 + 6)
  ctx.drawImage(br, x + xlen - 14, y + ylen - 14 + 6)
}

async function addRedBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  xlen: number,
  ylen: number,
) {
  const tl = await loadImage(path.join(bgDir, 'redTL.png'))
  const tr = await loadImage(path.join(bgDir, 'redTR.png'))
  const bl = await loadImage(path.join(bgDir, 'redBL.png'))
  const br = await loadImage(path.join(bgDir, 'redBR.png'))

  //corners
  drawBoxCorners(ctx, x, y, tl, tr, bl, br, xlen, ylen)

  //shadow
  ctx.fillStyle = '#1E2E32'
  ctx.fillRect(x - 2, y + 14, 2, ylen - 22)
  ctx.fillRect(x + 12, y + ylen + 6, xlen - 26, -6)

  //fill
  ctx.fillStyle = config.colors.mult
  ctx.fillRect(x, y + 14, xlen, ylen - 22)
  ctx.fillRect(x + 12, y, xlen - 24, ylen)
}

async function addGrayBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  xlen: number,
  ylen: number,
) {
  const tl = await loadImage(path.join(bgDir, 'grayTL.png'))
  const tr = await loadImage(path.join(bgDir, 'grayTR.png'))
  const bl = await loadImage(path.join(bgDir, 'grayBL.png'))
  const br = await loadImage(path.join(bgDir, 'grayBR.png'))

  drawBoxCorners(ctx, x, y, tl, tr, bl, br, xlen, ylen)

  //shadow
  ctx.fillStyle = '#1E2E32'
  ctx.fillRect(x - 2, y + 14, 2, ylen - 22)
  ctx.fillRect(x + 12, y + ylen + 6, xlen - 26, -6)

  //fill
  ctx.fillStyle = '#545454'
  ctx.fillRect(x, y + 14, xlen, ylen - 22)
  ctx.fillRect(x + 12, y, xlen - 24, ylen)

  ctx.save
  ctx.restore
}

async function addBlueBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  xlen: number,
  ylen: number,
) {
  const tl = await loadImage(path.join(bgDir, 'blueTL.png'))
  const tr = await loadImage(path.join(bgDir, 'blueTR.png'))
  const bl = await loadImage(path.join(bgDir, 'blueBL.png'))
  const br = await loadImage(path.join(bgDir, 'blueBR.png'))

  //corners
  drawBoxCorners(ctx, x, y, tl, tr, bl, br, xlen, ylen)

  //shadow
  ctx.fillStyle = '#1E2E32'
  ctx.fillRect(x - 2, y + 14, 2, ylen - 22)
  ctx.fillRect(x + 12, y + ylen + 6, xlen - 26, -6)

  //fill
  ctx.fillStyle = config.colors.chips
  ctx.fillRect(x, y + 14, xlen, ylen - 22)
  ctx.fillRect(x + 12, y, xlen - 24, ylen)
}

async function addBlackBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  xlen: number,
  ylen: number,
) {
  const tl = await loadImage(path.join(bgDir, 'blackTL.png'))
  const tr = await loadImage(path.join(bgDir, 'blackTR.png'))
  const bl = await loadImage(path.join(bgDir, 'blackBL.png'))
  const br = await loadImage(path.join(bgDir, 'blackBR.png'))

  //corners
  drawBoxCorners(ctx, x, y, tl, tr, bl, br, xlen, ylen)

  //shadow
  ctx.fillStyle = '#0B1415'
  ctx.fillRect(x - 2, y + 14, 2, ylen - 22)
  ctx.fillRect(x + 12, y + ylen + 6, xlen - 26, -6)

  //fill
  ctx.fillStyle = '#1E2B2D'
  ctx.fillRect(x, y + 14, xlen, ylen - 22)
  ctx.fillRect(x + 12, y, xlen - 24, ylen)
}

async function addBackBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  xlen: number,
  ylen: number,
) {
  const tl = await loadImage(path.join(bgDir, 'bgTL.png'))
  const tr = await loadImage(path.join(bgDir, 'bgTR.png'))
  const bl = await loadImage(path.join(bgDir, 'bgBL.png'))
  const br = await loadImage(path.join(bgDir, 'bgBR.png'))

  //fill
  ctx.fillStyle = '#3A5055'
  ctx.fillRect(x + 32, y + 9, xlen - 44, ylen - 32)
  ctx.fillRect(x + 9, y + 32, xlen - 18, ylen - 36)

  //corners
  ctx.drawImage(tl, x, y)
  ctx.drawImage(tr, x + xlen - 32, y)
  ctx.drawImage(bl, x - 6, y + ylen - 32)
  ctx.drawImage(br, x - 6 + xlen - 38, y + ylen - 32)

  //border
  ctx.fillStyle = '#BAC2D2'
  ctx.fillRect(x + 32, y, xlen - 64, 9)
  ctx.fillRect(x, y + 32, 9, ylen - 64)
  ctx.fillRect(x + xlen, y + 32, -9, ylen - 64)
  ctx.fillRect(x + 38, y + ylen, xlen - 82, -9)

  //shadows
  ctx.fillStyle = '#1b3233'
  ctx.fillRect(x + 38, y + ylen, xlen - 76, 12)
  ctx.fillRect(x, y + 48, -6, ylen - 58)
}

function normalizeDataPosition(
  playerData: StatsCanvasPlayerData,
  byDate: boolean,
) {
  const data = playerData.elo_graph_data

  if (!data || data.length === 0) {
    return []
  }

  // Sort chronologically (oldest first)
  const sortedData = [...data].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  let filteredData = sortedData

  if (byDate) {
    // Group by date (ignoring time)
    const grouped: Record<string, (typeof sortedData)[0]> = {}

    for (const point of sortedData) {
      const day = new Date(point.date).toISOString().split('T')[0] // e.g., "2025-09-08"

      // Keep only the max rating for that day
      if (!grouped[day] || point.rating > grouped[day].rating) {
        grouped[day] = point
      }
    }

    filteredData = Object.values(grouped)
  }

  // Sort again after grouping (important!)
  const finalData = filteredData.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  const startDate = new Date(finalData[0].date)

  // Add xVar (and keep rating as yVar)
  return finalData.map((point, index) => {
    const date = new Date(point.date)
    const xVar = byDate
      ? (date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) // days since start
      : index

    return {
      ...point,
      xVar,
      yVar: point.rating,
    }
  })
}

function createGraph(
  ctx: CanvasRenderingContext2D,
  playerData: StatsCanvasPlayerData,
  queueName: string,
  x: number,
  y: number,
  xlen: number,
  ylen: number,
  byDate: boolean = false,
  showDots: boolean = false,
) {
  /**
   * Draws normalizedPoints to ctx. The top left of the graph is at x,y, and the graph should be xlen across and ylen down
   */
  const normalizedPoints = normalizeDataPosition(playerData, byDate)
  const graphX = x
  const graphY = y + 15
  const graphXLen = xlen
  const graphYLen = ylen - 30

  // Find min/max ratings for scaling
  const ratings = normalizedPoints.map((p) => p.rating)
  const minRating = Math.round(Math.min(...ratings))
  const maxRating = playerData.peak_mmr
  const ratingRange = maxRating - minRating || 1

  // Find min/max x values for scaling (in case byDate gives non-integer xVar)
  const xValues = normalizedPoints.map((p) => p.xVar)
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const xRange = maxX - minX || 1

  //draw divides
  ctx.save()
  const guideRatings = [
    0,
    200,
    queueName == 'Smallworld' ? 225 : 230,
    queueName == 'Smallworld' ? 325 : 320,
    queueName == 'Smallworld' ? 425 : 460,
    queueName == 'Smallworld' ? 550 : 620,
    800,
    1000,
    1200,
    1400,
    1600,
    1800,
    2000,
    maxRating,
    minRating,
  ]
  let eloSplits = config.eloSplits
  let eloColors = [
    config.colors.stone,
    config.colors.steel,
    config.colors.gold,
    config.colors.lucky,
    config.colors.glass,
  ]

  if (queueName == 'Smallworld') {
    eloSplits = config.smallworldEloSplits
    eloColors = [
      config.colors.pebble,
      config.colors.ferrite,
      config.colors.pyrite,
      config.colors.clover,
      config.colors.crystal,
    ]
  }

  ctx.lineWidth = 0.5

  function convertToCanvasSpace(y: number) {
    return graphY + graphYLen - ((y - minRating) / ratingRange) * graphYLen
  }

  // Build rating bands (from minRating to maxRating)
  const bands = [minRating, ...eloSplits, maxRating]

  for (let i = 0; i < bands.length - 1; i++) {
    const bandMin = bands[i]
    const bandMax = bands[i + 1]

    // Convert rating band to canvas-space Y
    const yTop = convertToCanvasSpace(bandMax)
    const yBottom = convertToCanvasSpace(bandMin)

    // Create the graph path clipped to this band
    ctx.save()

    // Clip only the area between bandTop and bandBottom
    ctx.beginPath()
    ctx.rect(graphX, yTop, graphXLen, yBottom - yTop)
    ctx.clip()

    // Draw the filled shape under the line
    ctx.beginPath()
    const firstX =
      graphX + ((normalizedPoints[0].xVar - minX) / xRange) * graphXLen
    const firstY = convertToCanvasSpace(normalizedPoints[0].rating)
    ctx.moveTo(firstX, firstY)

    for (let j = 1; j < normalizedPoints.length; j++) {
      const p = normalizedPoints[j]
      const x = graphX + ((p.xVar - minX) / xRange) * graphXLen
      const y = convertToCanvasSpace(p.rating)
      ctx.lineTo(x, y)
    }

    // Close path down to the bottom of the graph area
    const lastX =
      graphX +
      ((normalizedPoints[normalizedPoints.length - 1].xVar - minX) / xRange) *
        graphXLen
    ctx.lineTo(lastX, graphY + graphYLen)
    ctx.lineTo(firstX, graphY + graphYLen)
    ctx.closePath()

    // Fill with semi-transparent band color
    const hex = eloColors[i] || eloColors[eloColors.length - 1]
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.12)` // translucent
    ctx.fill()
    ctx.restore()
  }

  //Draw Horizontal Lines

  guideRatings.forEach((r) => {
    // Skip if the line is outside of the current visible range
    if (r < minRating || r > maxRating) return

    const yPos =
      graphY + graphYLen - ((r - minRating) / ratingRange) * graphYLen

    if (queueName != 'Smallworld') {
      if (r == maxRating) {
        ctx.strokeStyle = config.colors.win
      } else if (r == 620) {
        ctx.strokeStyle = config.colors.glass
      } else if (r == 460) {
        ctx.strokeStyle = config.colors.lucky
      } else if (r == 320) {
        ctx.strokeStyle = config.colors.gold
      } else if (r == 250) {
        ctx.strokeStyle = config.colors.steel
      } else if (r == 200 && maxRating > 185 && maxRating > 215) {
        ctx.strokeStyle = config.colors.stone
      } else if (
        !(
          (r < maxRating + 15 && r > maxRating - 15) ||
          (r < minRating + 15 && r > minRating - 15)
        )
      ) {
        ctx.strokeStyle = config.colors.stone
      }
    } else {
      if (r == maxRating) {
        ctx.strokeStyle = config.colors.win
      } else if (r == 550) {
        ctx.strokeStyle = config.colors.crystal
      } else if (r == 425) {
        ctx.strokeStyle = config.colors.clover
      } else if (r == 325) {
        ctx.strokeStyle = config.colors.pyrite
      } else if (r == 225) {
        ctx.strokeStyle = config.colors.ferrite
      } else if (r == 200 && maxRating > 185 && maxRating > 215) {
        ctx.strokeStyle = config.colors.pebble
      } else if (
        !(
          (r < maxRating + 15 && r > maxRating - 15) ||
          (r < minRating + 15 && r > minRating - 15)
        )
      ) {
        ctx.strokeStyle = config.colors.pebble
      }
    }

    ctx.beginPath()
    ctx.moveTo(x, yPos)
    ctx.lineTo(x + xlen, yPos)
    ctx.stroke()
  })

  //DRAW LINE

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3

  // Helper: get color by rating
  function getColor(rating: number) {
    let idx = 0
    for (let i = 0; i < eloSplits.length; i++) {
      if (rating >= eloSplits[i]) idx = i + 1
    }
    return eloColors[idx]
  }

  //Actually draw line for loop
  for (let i = 0; i < normalizedPoints.length - 1; i++) {
    const p1 = normalizedPoints[i]
    const p2 = normalizedPoints[i + 1]

    const x1 = graphX + ((p1.xVar - minX) / xRange) * graphXLen
    const y1 = convertToCanvasSpace(p1.rating)
    const x2 = graphX + ((p2.xVar - minX) / xRange) * graphXLen
    const y2 = convertToCanvasSpace(p2.rating)

    const color1 = getColor(p1.rating)
    const color2 = getColor(p2.rating)

    //if the points have the same color, then draw the line, otherwise do some linear algebra
    if (color1 === color2) {
      ctx.beginPath()
      ctx.strokeStyle = color1
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    } else {
      // y = n
      const crossedSplit = eloSplits.find(
        (split) =>
          split >= Math.min(p1.rating, p2.rating) &&
          split <= Math.max(p1.rating, p2.rating),
      )

      // Convert rating split → canvas y
      const y3Canvas = convertToCanvasSpace(crossedSplit ?? 0)

      // line equation
      const m = (y2 - y1) / (x2 - x1)
      const b = y1 - m * x1
      const x3 = (y3Canvas - b) / m

      ctx.beginPath()
      ctx.strokeStyle = color1
      ctx.moveTo(x1, y1)
      ctx.lineTo(x3, y3Canvas)
      ctx.stroke()

      ctx.beginPath()
      ctx.strokeStyle = color2
      ctx.moveTo(x3, y3Canvas)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  ctx.restore()

  // Draw dots at each data point if enabled
  if (showDots) {
    for (let i = 0; i < normalizedPoints.length; i++) {
      const p = normalizedPoints[i]
      const x = graphX + ((p.xVar - minX) / xRange) * graphXLen
      const y = convertToCanvasSpace(p.rating)
      const color = getColor(p.rating)

      // Draw dot
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }
  }

  // Add y level labels

  guideRatings.forEach((r) => {
    // Skip if the line is outside of the current visible range
    if (r < minRating || r > maxRating) return

    const yPos =
      graphY + graphYLen - ((r - minRating) / ratingRange) * graphYLen

    ctx.fillStyle = config.colors.textSecondary
    ctx.textAlign = 'left'
    ctx.font = config.fonts.tiny

    if (r == maxRating) {
      ctx.fillText(`${Math.round(r)}`, x, yPos - 16)
      ctx.font = config.fonts.tiny
      ctx.fillText(
        ' · Peak MMR',
        x + ctx.measureText(`${Math.round(r)}`).width - 3,
        yPos - 16,
      )
    } else if (r == 620) {
      ctx.fillText(r.toString(), x, yPos - 16)
    } else if (r == 460) {
      ctx.fillText(r.toString(), x, yPos - 16)
    } else if (r == 320) {
      ctx.fillText(r.toString(), x, yPos - 16)
    } else if (r == 250) {
      ctx.fillText(r.toString(), x, yPos - 16)
    } else {
      ctx.fillText(r.toString(), x, yPos - 16)
    }
  })

  // Add x axis
  function addXAxisLabel(str: string, xVar: number) {
    ctx.fillText(
      str.toString(),
      graphX + ((xVar - minX) / xRange) * graphXLen,
      graphY + graphYLen + 4,
    )
  }

  if (byDate) {
    function formatDateToMMDD(dateString: string): string {
      const date = new Date(dateString)
      const day = date.getUTCDate().toString().padStart(2, '0')
      const month = (date.getUTCMonth() + 1).toString().padStart(2, '0')
      return `${month}/${day}`
    }

    ctx.fillStyle = config.colors.textSecondary
    ctx.textAlign = 'left'
    ctx.font = config.fonts.tiny

    ctx.fillText(
      formatDateToMMDD(normalizedPoints[0].date.toString()) + ' · Date',
      graphX,
      graphY + graphYLen + 4,
    )

    ctx.textAlign = 'right'
    if (
      (normalizedPoints[Math.floor(normalizedPoints.length * 0.5)].xVar -
        minX) /
        xRange >=
      (normalizedPoints[Math.floor(normalizedPoints.length * 0.75)].xVar -
        minX) /
        xRange -
        0.1
    ) {
      addXAxisLabel(
        formatDateToMMDD(
          normalizedPoints[
            Math.floor(normalizedPoints.length * 0.5)
          ].date.toString(),
        ),
        normalizedPoints[Math.floor(normalizedPoints.length * 0.5)].xVar,
      )
    } else {
      addXAxisLabel(
        formatDateToMMDD(
          normalizedPoints[
            Math.floor(normalizedPoints.length * 0.5)
          ].date.toString(),
        ),
        normalizedPoints[Math.floor(normalizedPoints.length * 0.5)].xVar,
      )
      addXAxisLabel(
        formatDateToMMDD(
          normalizedPoints[
            Math.floor(normalizedPoints.length * 0.75)
          ].date.toString(),
        ),
        normalizedPoints[Math.floor(normalizedPoints.length * 0.75)].xVar,
      )
    }

    addXAxisLabel(
      formatDateToMMDD(
        normalizedPoints[normalizedPoints.length - 1].date.toString(),
      ),
      normalizedPoints[normalizedPoints.length - 1].xVar,
    )
  } else {
    ctx.fillStyle = config.colors.textSecondary
    ctx.textAlign = 'left'
    ctx.font = config.fonts.tiny

    ctx.fillText(
      normalizedPoints[0].xVar.toString() + ' · Games',
      graphX,
      graphY + graphYLen + 4,
    )

    ctx.textAlign = 'right'
    addXAxisLabel(
      normalizedPoints[
        Math.floor(normalizedPoints.length * 0.25)
      ].xVar.toString(),
      normalizedPoints[Math.floor(normalizedPoints.length * 0.25)].xVar,
    )
    addXAxisLabel(
      normalizedPoints[
        Math.floor(normalizedPoints.length * 0.5)
      ].xVar.toString(),
      normalizedPoints[Math.floor(normalizedPoints.length * 0.5)].xVar,
    )
    addXAxisLabel(
      normalizedPoints[
        Math.floor(normalizedPoints.length * 0.75)
      ].xVar.toString(),
      normalizedPoints[Math.floor(normalizedPoints.length * 0.75)].xVar,
    )
    addXAxisLabel(
      normalizedPoints[normalizedPoints.length - 1].xVar.toString(),
      normalizedPoints[normalizedPoints.length - 1].xVar,
    )
  }
}

function addSideData(
  ctx: CanvasRenderingContext2D,
  playerData: StatsCanvasPlayerData,
  x: number,
  y: number,
  xlen: number,
  ylen: number,
) {
  const winsData = playerData.stats[0]
  const lossesData = playerData.stats[1]
  const gamesData = playerData.stats[2]
  const winrateData = playerData.stats[3]

  addData(winrateData, x + 10, y, xlen / 2 - 25, ylen)
  addData(gamesData, x + 15 + xlen / 2, y, xlen / 2 - 25, ylen)
  addData(winsData, x + 10, y + 95, xlen / 2 - 25, ylen)
  addData(lossesData, x + 15 + xlen / 2, y + 95, xlen / 2 - 25, ylen)

  function addData(
    data: { label: string; value: string; percentile: number; isTop: boolean },
    x: number,
    y: number,
    xlen: number,
    ylen: number,
  ) {
    ctx.textAlign = 'center'
    ctx.font = config.fonts.statLabel
    ctx.fillStyle = config.colors.textPrimary
    ctx.fillText(data.value, x + xlen / 2, y + ylen / 2 + 5)

    ctx.textAlign = 'left'
    ctx.font = config.fonts.small
    ctx.fillStyle = config.colors.textTertiary

    ctx.fillText(data.label, x, y + 15)

    ctx.textAlign = 'right'
    ctx.font = config.fonts.tiny
    ctx.fillStyle = config.colors.textTertiary
    if (data.isTop) {
      ctx.fillText(
        'Top ' + data.percentile.toString() + '%',
        x + xlen,
        y + ylen - 10,
      )
    } else {
      ctx.fillText(
        'Bottom ' + data.percentile.toString() + '%',
        x + xlen,
        y + ylen - 10,
      )
    }
  }
}

function drawPreviousGames(
  ctx: CanvasRenderingContext2D,
  playerData: StatsCanvasPlayerData,
  x: number,
  y: number,
  xlen: number,
  ylen: number,
) {
  const startX = x + 10
  const panelWidth = xlen
  const lineHeight = 22
  const maxGames = 5

  ctx.textAlign = 'center'
  ctx.font = config.fonts.prevgameLabel
  ctx.fillStyle = config.colors.textTertiary
  ctx.fillText('PREVIOUS GAMES', x + xlen / 2, y + 20)

  ctx.textAlign = 'left'

  // Display up to maxGames recent games
  for (let i = 0; i < maxGames; i++) {
    const lineY = y + 70 + i * lineHeight

    if (i < playerData.previous_games.length) {
      const game = playerData.previous_games[i]
      const numberText = `${i + 1}.`
      const resultText = game.change > 0 ? 'WIN' : 'LOSS'
      const changeText = `${game.change > 0 ? '+' : ''}${game.change.toFixed(1)}`

      ctx.font = config.fonts.gameList
      ctx.textAlign = 'left'

      ctx.fillStyle = config.colors.textPrimary
      ctx.fillText(numberText, startX, lineY)

      ctx.fillStyle = game.change > 0 ? config.colors.win : config.colors.lose
      const numberWidth = ctx.measureText(numberText).width
      ctx.fillText(resultText, startX + numberWidth + 5, lineY)

      ctx.fillText(changeText, startX + numberWidth + 45, lineY)

      ctx.fillStyle = config.colors.textSecondary
      ctx.textAlign = 'right'
      ctx.font = config.fonts.tiny
      ctx.fillText(
        timeAgo(new Date(game.time)),
        startX + panelWidth - 20,
        lineY,
      )
    }
  }

  // Current win/loss streak
  const streakY = y + 45
  ctx.fillStyle = config.colors.textSecondary
  ctx.textAlign = 'left'

  ctx.fillText('CURRENT STREAK: ', startX + 30, streakY)

  ctx.fillStyle =
    playerData.win_streak > 0
      ? config.colors.win
      : playerData.win_streak < 0
        ? config.colors.lose
        : config.colors.textSecondary
  ctx.fillText(`${playerData.win_streak}`, startX + 135, streakY)

  ctx.textBaseline = 'top'
}

async function rankupBar(
  ctx: CanvasRenderingContext2D,
  playerData: StatsCanvasPlayerData,
  x: number,
  y: number,
  xlen: number,
  ylen: number,
  xlen2: number,
) {
  const rankColor = playerData.rank_color || config.colors.textTertiary
  const nextRankColor = playerData.next_rank_color || config.colors.textPrimary
  const rankName = (playerData.rank_name || 'UNRANKED').toUpperCase()
  const nextRankName = playerData.next_rank_name
    ? playerData.next_rank_name.toUpperCase()
    : ''

  const nextRankMRR = playerData.next_rank_mmr
  const rankMMR = playerData.rank_mmr
  const MMR = playerData.mmr

  const nextRankPosition = playerData.next_rank_position
  const rankPosition = playerData.rank_position
  const position = playerData.leaderboard_position

  async function corner(x: number, y: number, xlen: number, ylen: number) {
    const tl = await loadImage(path.join(bgDir, 'antiTL.png'))
    const tr = await loadImage(path.join(bgDir, 'antiTR.png'))
    const bl = await loadImage(path.join(bgDir, 'antiBL.png'))
    const br = await loadImage(path.join(bgDir, 'antiBR.png'))

    drawBoxCorners(ctx, x, y, tl, tr, bl, br, xlen, ylen)

    //shadow
    ctx.fillStyle = '#1E2E32'
    ctx.fillRect(x - 2, y + 14, 2, ylen - 22)
    ctx.fillRect(x + 12, y + ylen + 6, xlen - 26, -6)
  }

  async function drawBar(
    x: number,
    y: number,
    xlen: number,
    ylen: number,
    xmin: number,
    xmax: number,
    xact: number,
  ) {
    ctx.fillStyle = nextRankColor
    ctx.fillRect(x, y, xlen, ylen)

    const xfill = xlen * ((xact - xmin) / (xmax - xmin))

    ctx.fillStyle = rankColor
    if (rankName == 'STONE') {
      ctx.fillStyle = '#868692ff'
    }

    ctx.fillRect(x, y, xfill, ylen)

    await corner(x, y, xlen, ylen)

    ctx.fillStyle = config.colors.textPrimary
  }

  function toProperCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

  function borderText(
    str: string,
    x: number,
    y: number,
    fill: string,
    border: string,
  ) {
    ctx.fillStyle = border
    ctx.fillText(str, x + 1, y + 1)
    ctx.fillText(str, x + 1, y - 1)
    ctx.fillText(str, x - 1, y + 1)
    ctx.fillText(str, x - 1, y - 1)

    ctx.fillStyle = fill
    ctx.fillText(str, x, y)
  }

  ctx.fillStyle = nextRankColor
  ctx.fillRect(x + xlen + 10, y, xlen2, ylen)
  await corner(x + xlen + 10, y, xlen2, ylen)

  ctx.textAlign = 'center'
  ctx.font = config.fonts.tiny

  let nextRankNameConcat = nextRankName

  if (nextRankName == 'HOLOGRAPHIC' || nextRankName == 'POLYCHROME') {
    nextRankNameConcat = nextRankName.slice(0, 4)
  }

  if (nextRankMRR != null && rankMMR != null && MMR != null) {
    await drawBar(x, y, xlen, ylen, rankMMR, nextRankMRR, MMR)

    borderText(
      Math.round(nextRankMRR - MMR).toString() +
        ' MMR to ' +
        toProperCase(nextRankName),
      x + xlen + 10 + xlen2 / 2,
      y + ylen - 9,
      config.colors.textPrimary,
      config.colors.textQuaternary,
    )
  } else if (position && rankPosition && nextRankPosition && position != 1) {
    await drawBar(x, y, xlen, ylen, rankPosition, nextRankPosition, position)

    if (position - nextRankPosition == 1) {
      borderText(
        (position - nextRankPosition).toString() +
          ' rank to ' +
          toProperCase(nextRankNameConcat),
        x + xlen + 10 + xlen2 / 2,
        y + ylen - 9,
        config.colors.textPrimary,
        config.colors.textQuaternary,
      )
    } else {
      borderText(
        (position - nextRankPosition).toString() +
          ' ranks to ' +
          toProperCase(nextRankNameConcat),
        x + xlen + 10 + xlen2 / 2,
        y + ylen - 9,
        config.colors.textPrimary,
        config.colors.textQuaternary,
      )
    }
  } else {
    await drawBar(x, y, xlen, ylen, 0, 1, 1)
    borderText(
      '₍^. .^₎/',
      x + xlen + 10 + xlen2 / 2,
      y + ylen - 9,
      config.colors.textPrimary,
      config.colors.textQuaternary,
    )
  }

  ctx.textAlign = 'left'
  borderText(
    rankName,
    x + 10,
    y + ylen - 9,
    config.colors.textPrimary,
    config.colors.textQuaternary,
  )

  ctx.textAlign = 'right'
  borderText(
    nextRankName,
    x + xlen - 10,
    y + ylen - 9,
    config.colors.textPrimary,
    config.colors.textQuaternary,
  )
}

export async function drawPlayerStatsCanvas(
  queueName: string,
  playerData: StatsCanvasPlayerData,
  byDate: boolean,
  showDots: boolean = false,
) {
  // Render at higher resolution for sharper text (2x, 4x, etc.)
  // Higher scale = more anti-aliasing but larger file size
  const scale = 2
  const canvas = new Canvas(config.width * scale, config.height * scale)
  const ctx = canvas.getContext('2d')

  ctx.imageSmoothingEnabled = false
  ctx.scale(2, 2)

  //back elements
  await addBackground(ctx, playerData.stat_background)
  ctx.imageSmoothingEnabled = false
  await addBackBox(
    ctx,
    config.width / 32,
    config.height / 32,
    config.width - config.width / 16,
    config.height - config.height / 12,
  )
  ctx.imageSmoothingEnabled = true

  //top elements
  await drawAvatar(ctx, 60, 50, 110, playerData)

  ctx.textBaseline = 'middle'

  //change the gray and red boxes depending on if mmr is 5 digits or >5
  if (`${playerData.peak_mmr}`.length > 5) {
    await addGrayBox(ctx, 180, 50, 385, 80)
    await addRedBox(ctx, 575, 50, 166, 80)
    await rankupBar(ctx, playerData, 180, 140, 385, 20, 166)
  } else {
    await addGrayBox(ctx, 180, 50, 415, 80)
    await addRedBox(ctx, 605, 50, 136, 80)
    await rankupBar(ctx, playerData, 180, 140, 415, 20, 136)
  }

  await addTopText(ctx, playerData, queueName)

  //side elements
  await addBlackBox(ctx, 60, 170, 95, 85)
  await addBlackBox(ctx, 165, 170, 95, 85)
  await addBlackBox(ctx, 60, 265, 95, 85)
  await addBlackBox(ctx, 165, 265, 95, 85)

  await addBlackBox(ctx, 60, 360, 200, 180)

  addSideData(ctx, playerData, 60, 170, 200, 85)
  drawPreviousGames(ctx, playerData, 60, 360, 200, 180)

  //graph
  await addBlackBox(ctx, 270, 170, 470, 370)
  createGraph(ctx, playerData, queueName, 280, 180, 450, 350, byDate, showDots)

  // Export with high quality settings
  return await canvas.toBuffer('png', {
    quality: 1.0,
    density: scale,
  })
}

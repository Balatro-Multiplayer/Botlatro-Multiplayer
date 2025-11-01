import { loadImage } from 'skia-canvas'
import path from 'path'

// Background metadata
export interface Background {
  id: string
  name: string
  filename: string
}

// Cache for preloaded images
const imageCache = new Map<string, any>()

// List of all available backgrounds
export const BACKGROUNDS: Background[] = [
  { id: 'abandoned', name: 'Abandoned', filename: 'bgAbandoned.png' },
  { id: 'anaglyph', name: 'Anaglyph', filename: 'bgAnaglyph.png' },
  { id: 'black', name: 'Black', filename: 'bgBlack.png' },
  { id: 'blue', name: 'Blue', filename: 'bgBlue.png' },
  { id: 'checkered', name: 'Checkered', filename: 'bgCheckered.png' },
  { id: 'cocktail', name: 'Cocktail', filename: 'bgCocktail.png' },
  { id: 'erratic', name: 'Erratic', filename: 'bgErratic.png' },
  { id: 'felt', name: 'Felt', filename: 'bgFelt.png' },
  { id: 'ghost', name: 'Ghost', filename: 'bgGhost.png' },
  { id: 'green', name: 'Green', filename: 'bgGreen.png' },
  { id: 'magic', name: 'Magic', filename: 'bgMagic.png' },
  { id: 'main', name: 'Main', filename: 'bgMain.png' },
  { id: 'nebula', name: 'Nebula', filename: 'bgNebula.png' },
  { id: 'orange', name: 'Orange', filename: 'bgOrange.png' },
  { id: 'painted', name: 'Painted', filename: 'bgPainted.png' },
  { id: 'planet', name: 'Planet', filename: 'bgPlanet.png' },
  { id: 'plasma', name: 'Plasma', filename: 'bgPlasma.png' },
  { id: 'red', name: 'Red', filename: 'bgRed.png' },
  { id: 'violet', name: 'Violet', filename: 'bgViolet.png' },
  { id: 'yellow', name: 'Yellow', filename: 'bgYellow.png' },
  { id: 'zodiac', name: 'Zodiac', filename: 'bgZodiac.png' },
]

// Preload all background images
export async function preloadBackgrounds(): Promise<void> {
  console.log('Preloading background images...')

  const bgDir = process.env.ASSETS_DIR || path.join(process.cwd(), 'assets')

  for (const bg of BACKGROUNDS) {
    try {
      const imagePath = path.join(bgDir, 'backgrounds', bg.filename)
      const image = await loadImage(imagePath)
      imageCache.set(bg.filename, image)
    } catch (error) {
      console.error(`Failed to load ${bg.filename}:`, error)
    }
  }

  console.log(`Preloaded ${imageCache.size}/${BACKGROUNDS.length} backgrounds`)
}

// Get a preloaded background image
export function getBackground(filename: string): any | null {
  return imageCache.get(filename) || null
}

// Get background by ID
export function getBackgroundById(id: string): Background | undefined {
  return BACKGROUNDS.find((bg) => bg.id === id)
}

// Get background by filename
export function getBackgroundByFilename(
  filename: string,
): Background | undefined {
  return BACKGROUNDS.find((bg) => bg.filename === filename)
}

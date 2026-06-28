import { supabase } from './supabase'

const TERRAIN_TYPES = ['plains', 'forest', 'mountains', 'ocean', 'desert', 'swamp', 'hills']
const TERRAIN_WEIGHTS = [30, 25, 15, 20, 5, 5, 10]

const TERRAIN_AFFINITY: Record<string, Record<string, number>> = {
  plains:    { plains: 8, forest: 5, hills: 4, mountains: 2, desert: 3, swamp: 2, ocean: 1 },
  forest:    { forest: 8, plains: 5, hills: 3, swamp: 4, mountains: 2, desert: 1, ocean: 1 },
  mountains: { mountains: 8, hills: 6, forest: 3, plains: 2, ocean: 2, desert: 2, swamp: 1 },
  ocean:     { ocean: 10, plains: 3, swamp: 2, hills: 1, forest: 1, mountains: 1, desert: 1 },
  desert:    { desert: 8, plains: 5, hills: 3, mountains: 2, forest: 1, swamp: 1, ocean: 1 },
  swamp:     { swamp: 8, forest: 5, plains: 4, ocean: 3, hills: 2, mountains: 1, desert: 1 },
  hills:     { hills: 8, mountains: 6, plains: 4, forest: 3, desert: 2, swamp: 1, ocean: 1 },
}

function getNeighbors(x: number, y: number, width: number, height: number): number[][] {
  const isOdd = x % 2 === 1
  const neighbors = [
    [x - 1, isOdd ? y : y - 1],
    [x - 1, isOdd ? y + 1 : y],
    [x, y - 1],
    [x, y + 1],
    [x + 1, isOdd ? y : y - 1],
    [x + 1, isOdd ? y + 1 : y],
  ]
  return neighbors.filter(([nx, ny]) => nx >= 0 && nx < width && ny >= 0 && ny < height)
}

function pickTerrainWithAffinity(neighborTerrains: string[]): string {
  const weights: Record<string, number> = {}
  TERRAIN_TYPES.forEach((t, i) => { weights[t] = TERRAIN_WEIGHTS[i] })

  neighborTerrains.forEach(neighbor => {
    const affinity = TERRAIN_AFFINITY[neighbor]
    if (affinity) {
      TERRAIN_TYPES.forEach(t => { weights[t] = (weights[t] || 0) + (affinity[t] || 0) * 3 })
    }
  })

  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  for (const terrain of TERRAIN_TYPES) {
    rand -= weights[terrain]
    if (rand <= 0) return terrain
  }
  return 'plains'
}

function locationCode(x: number, y: number): string {
  return `L${String(x).padStart(2, '0')}${String(y).padStart(2, '0')}`
}

function populationForTerrain(terrain: string): number {
  const base: Record<string, number> = {
    plains: 500, forest: 200, mountains: 100,
    ocean: 0, desert: 50, swamp: 75, hills: 150
  }
  return base[terrain] ?? 0
}

export async function generateWorld(gameName: string, width: number, height: number) {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({ name: gameName, status: 'setup' })
    .select()
    .single()
  if (gameError) throw gameError

  const { data: world, error: worldError } = await supabase
    .from('worlds')
    .insert({ game_id: game.id, width, height, ew_wrap: true })
    .select()
    .single()
  if (worldError) throw worldError

  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(''))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const neighborCoords = getNeighbors(x, y, width, height)
      const neighborTerrains = neighborCoords
        .map(([nx, ny]) => grid[ny][nx])
        .filter(t => t !== '')
      grid[y][x] = pickTerrainWithAffinity(neighborTerrains)
    }
  }

  const locations = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = grid[y][x]
      locations.push({
          world_id: world.id,
          loc_code: locationCode(x, y),
          terrain_type: terrain,
          population: populationForTerrain(terrain),
          population_optimal: populationForTerrain(terrain),
        })
      }
    }

  for (let i = 0; i < locations.length; i += 100) {
    const { error } = await supabase.from('locations').insert(locations.slice(i, i + 100))
    if (error) throw error
  }

  return { game, world, locationCount: locations.length }
}
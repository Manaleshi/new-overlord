import { supabase } from './supabase'

const TERRAIN_TYPES = ['plains', 'forest', 'mountains', 'ocean', 'desert', 'swamp', 'hills']
const TERRAIN_WEIGHTS = [27, 27, 7, 8, 2, 2, 27]

const TERRAIN_AFFINITY: Record<string, Record<string, number>> = {
  plains:    { plains: 20, forest: 6, hills: 5, mountains: 1, desert: 4, swamp: 2, ocean: 1 },
  forest:    { forest: 20, plains: 6, hills: 4, swamp: 5, mountains: 2, desert: 1, ocean: 1 },
  mountains: { mountains: 20, hills: 12, forest: 4, plains: 1, ocean: 2, desert: 2, swamp: 1 },
  ocean:     { ocean: 25, plains: 2, swamp: 3, hills: 1, forest: 1, mountains: 1, desert: 1 },
  desert:    { desert: 20, plains: 6, hills: 4, mountains: 2, forest: 1, swamp: 1, ocean: 1 },
  swamp:     { swamp: 20, forest: 6, plains: 4, ocean: 5, hills: 1, mountains: 1, desert: 1 },
  hills:     { hills: 20, mountains: 12, plains: 5, forest: 4, desert: 3, swamp: 1, ocean: 1 },
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
      TERRAIN_TYPES.forEach(t => { weights[t] = (weights[t] || 0) + (affinity[t] || 0) * 6 })
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

      let population_center = null
      if (terrain !== 'ocean' && Math.random() < 0.12) {
        const roll = Math.random()
        const type = roll < 0.05 ? 'city' : roll < 0.25 ? 'town' : 'village'
        const settlementPop = type === 'city'
          ? Math.floor(Math.random() * 7000) + 3000
          : type === 'town'
          ? Math.floor(Math.random() * 2200) + 800
          : Math.floor(Math.random() * 600) + 200
        population_center = { name: `${type} at ${locationCode(x, y)}`, type, population: settlementPop }
      }

      const basePop = populationForTerrain(terrain)
      const totalPop = basePop + (population_center ? population_center.population : 0)

      locations.push({
        world_id: world.id,
        loc_code: locationCode(x, y),
        terrain_type: terrain,
        population: totalPop,
        population_optimal: totalPop,
        resources: population_center ? { population_center } : {},
      })
    }
  }

  for (let i = 0; i < locations.length; i += 100) {
    const { error } = await supabase.from('locations').insert(locations.slice(i, i + 100))
    if (error) throw error
  }

  return { game, world, locationCount: locations.length }
}
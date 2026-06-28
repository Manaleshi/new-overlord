import { supabase } from './supabase'

const TERRAIN_TYPES = ['plains', 'forest', 'mountains', 'ocean', 'desert', 'swamp', 'hills']

const TERRAIN_WEIGHTS = [30, 25, 15, 15, 5, 5, 5]

function pickTerrain(): string {
  const total = TERRAIN_WEIGHTS.reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  for (let i = 0; i < TERRAIN_TYPES.length; i++) {
    rand -= TERRAIN_WEIGHTS[i]
    if (rand <= 0) return TERRAIN_TYPES[i]
  }
  return 'plains'
}

function locationCode(x: number, y: number): string {
  const px = String(x).padStart(2, '0')
  const py = String(y).padStart(2, '0')
  return `L${px}${py}`
}

function populationForTerrain(terrain: string): number {
  const base: Record<string, number> = {
    plains: 500, forest: 200, mountains: 100,
    ocean: 0, desert: 50, swamp: 75, hills: 150
  }
  return base[terrain] ?? 0
}

export async function generateWorld(gameName: string, width: number, height: number) {
  // Create the game
  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({ name: gameName, status: 'setup' })
    .select()
    .single()

  if (gameError) throw gameError

  // Create the world
  const { data: world, error: worldError } = await supabase
    .from('worlds')
    .insert({ game_id: game.id, width, height, ew_wrap: true })
    .select()
    .single()

  if (worldError) throw worldError

  // Generate locations
  const locations = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = pickTerrain()
      const pop = populationForTerrain(terrain)
      locations.push({
        world_id: world.id,
        loc_code: locationCode(x, y),
        terrain_type: terrain,
        population: pop,
        population_optimal: pop,
      })
    }
  }

  // Insert in batches of 100
  for (let i = 0; i < locations.length; i += 100) {
    const batch = locations.slice(i, i + 100)
    const { error } = await supabase.from('locations').insert(batch)
    if (error) throw error
  }

  return { game, world, locationCount: locations.length }
}
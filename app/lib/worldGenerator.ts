import { supabase } from './supabase'
import { generateRegionName, generateSettlementName } from './nameGenerator'

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

const TERRAIN_WAGES: Record<string, number> = {
  plains: 10, forest: 8, mountains: 12, ocean: 0,
  desert: 6, swamp: 7, hills: 9
}

const TERRAIN_RESOURCES: Record<string, string[]> = {
  plains: ['grain', 'cattle', 'horses'],
  forest: ['wood', 'herbs', 'hide'],
  mountains: ['stone', 'iron', 'gems'],
  ocean: ['fish'],
  desert: ['stone', 'gems'],
  swamp: ['herbs', 'fish'],
  hills: ['stone', 'iron', 'cattle'],
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

function distanceFromCenter(x: number, y: number, cx: number, cy: number): number {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
}

function basePopulationForTerrain(terrain: string): number {
  const base: Record<string, number> = {
    plains: 500, forest: 200, mountains: 100,
    ocean: 0, desert: 50, swamp: 75, hills: 150
  }
  return base[terrain] ?? 0
}

function calculateWages(population: number, terrain: string): number {
  const baseWage = TERRAIN_WAGES[terrain] ?? 10
  if (population < 100) return Math.round(baseWage * 1.3)
  if (population < 500) return Math.round(baseWage * 1.1)
  if (population < 2000) return Math.round(baseWage * 1.0)
  if (population < 5000) return Math.round(baseWage * 0.9)
  return Math.round(baseWage * 0.8)
}

function calculateTaxes(population: number, wages: number, hasTitle: boolean): number {
  const taxRate = hasTitle ? 0.18 : 0
  return Math.round(population * wages * taxRate)
}

function floodFill(
  startX: number, startY: number, terrain: string,
  grid: string[][], visited: boolean[][],
  width: number, height: number
): [number, number][] {
  const cluster: [number, number][] = []
  const stack: [number, number][] = [[startX, startY]]
  while (stack.length > 0) {
    const [x, y] = stack.pop()!
    if (visited[y][x]) continue
    if (grid[y][x] !== terrain) continue
    visited[y][x] = true
    cluster.push([x, y])
    for (const [nx, ny] of getNeighbors(x, y, width, height)) {
      if (!visited[ny][nx] && grid[ny][nx] === terrain) stack.push([nx, ny])
    }
  }
  return cluster
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

  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  const maxDist = Math.sqrt(cx ** 2 + cy ** 2)
  const imperialRadius = 4

  // Generate terrain grid
  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(''))

  // Force center area to plains for Imperial City
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = distanceFromCenter(x, y, cx, cy)
      if (dist <= imperialRadius) {
        grid[y][x] = 'plains'
      } else {
        const neighborCoords = getNeighbors(x, y, width, height)
        const neighborTerrains = neighborCoords
          .map(([nx, ny]) => grid[ny][nx])
          .filter(t => t !== '')
        grid[y][x] = pickTerrainWithAffinity(neighborTerrains)
      }
    }
  }

  // Flood fill for region names
  const visited: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false))
  const usedNames = new Set<string>()
  const geoNames: Record<string, string> = {}
  const baseNames: Record<string, string> = {}

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!visited[y][x]) {
        const terrain = grid[y][x]
        const cluster = floodFill(x, y, terrain, grid, visited, width, height)
        const regionName = generateRegionName(terrain, usedNames)
        const baseName = regionName.split(' ')[0]
        for (const [cx2, cy2] of cluster) {
          geoNames[locationCode(cx2, cy2)] = regionName
          baseNames[locationCode(cx2, cy2)] = baseName
        }
      }
    }
  }

  // Override center region name to something imperial
  const imperialRegionName = 'Imperial Heartlands'
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = distanceFromCenter(x, y, cx, cy)
      if (dist <= imperialRadius) {
        geoNames[locationCode(x, y)] = imperialRegionName
        baseNames[locationCode(x, y)] = 'Imperial'
      }
    }
  }

  // Generate settlements with distance-based density
  const settlementUsedNames = new Set<string>()
  type SettlementData = { type: string; population: number; locCode: string }
  const settlementMap: Record<string, SettlementData> = {}

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = grid[y][x]
      if (terrain === 'ocean') continue

      const dist = distanceFromCenter(x, y, cx, cy)
      const distFactor = 1 - (dist / maxDist)

      // Settlement probability increases near center
      const settlementChance = 0.04 + (distFactor * 0.25)
      // City probability increases near center
      const cityChance = 0.01 + (distFactor * 0.08)
      const townChance = 0.05 + (distFactor * 0.15)

      // Terrain modifier for settlement likelihood
      const terrainSettleMod: Record<string, number> = {
        plains: 1.4, hills: 1.2, forest: 1.1,
        mountains: 0.4, swamp: 0.3, desert: 0.5, ocean: 0
      }
      const mod = terrainSettleMod[terrain] ?? 1.0

      if (Math.random() < settlementChance * mod) {
        const roll = Math.random()
        const type = roll < cityChance ? 'city'
          : roll < cityChance + townChance ? 'town' : 'village'
        const settlementPop = type === 'city'
          ? Math.floor(Math.random() * 7000) + 3000
          : type === 'town'
          ? Math.floor(Math.random() * 2200) + 800
          : Math.floor(Math.random() * 600) + 200
        const lc = locationCode(x, y)
        settlementMap[lc] = { type, population: settlementPop, locCode: lc }
      }
    }
  }

  // Force Imperial City at center
  const imperialCityCode = locationCode(cx, cy)
  settlementMap[imperialCityCode] = {
    type: 'imperial',
    population: 75000,
    locCode: imperialCityCode
  }

  // Group settlements by region, name them
  const regionSettlements: Record<string, SettlementData[]> = {}
  for (const [lc, settlement] of Object.entries(settlementMap)) {
    const regionName = geoNames[lc]
    if (!regionSettlements[regionName]) regionSettlements[regionName] = []
    regionSettlements[regionName].push(settlement)
  }

  const settlementNames: Record<string, string> = {}
  settlementNames[imperialCityCode] = 'The Imperial City'

  for (const [regionName, settlements] of Object.entries(regionSettlements)) {
    const baseName = settlements[0] ? baseNames[settlements[0].locCode] : null
    const sorted = [...settlements].sort((a, b) => b.population - a.population)
    sorted.forEach((s, i) => {
      if (s.locCode === imperialCityCode) return
      if (i === 0 && regionName !== imperialRegionName) {
        settlementNames[s.locCode] = generateSettlementName(baseName, settlementUsedNames)
      } else {
        settlementNames[s.locCode] = generateSettlementName(null, settlementUsedNames)
      }
    })
  }

  // Build location rows
  const locations = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = grid[y][x]
      const lc = locationCode(x, y)
      const settlement = settlementMap[lc]
      const dist = distanceFromCenter(x, y, cx, cy)
      const isImperialLand = dist <= imperialRadius
      const isImperialCity = lc === imperialCityCode

      const basePop = basePopulationForTerrain(terrain)
      const settlePop = settlement ? settlement.population : 0
      const totalPop = basePop + settlePop

      const wages = calculateWages(totalPop, terrain)
      const taxes = calculateTaxes(totalPop, wages, false)
      const resources = TERRAIN_RESOURCES[terrain] ?? []

      locations.push({
        world_id: world.id,
        loc_code: lc,
        terrain_type: terrain,
        geographic_name: geoNames[lc],
        population: totalPop,
        population_optimal: totalPop,
        resources: {
          ...(settlement ? {
            population_center: {
              name: settlementNames[lc] ?? 'Unknown',
              type: settlement.type,
              population: settlement.population,
            }
          } : {}),
          is_imperial_land: isImperialLand,
          is_imperial_city: isImperialCity,
          natural_resources: resources,
        },
        economics: {
          wages,
          taxes,
          market: settlement?.type === 'city' || settlement?.type === 'imperial',
          market_days: settlement?.type === 'city' || settlement?.type === 'imperial' ? [15, 30] : [],
        },
      })
    }
  }

  // Insert in batches
  for (let i = 0; i < locations.length; i += 100) {
    const { error } = await supabase.from('locations').insert(locations.slice(i, i + 100))
    if (error) throw error
  }

  return { game, world, locationCount: locations.length }
}
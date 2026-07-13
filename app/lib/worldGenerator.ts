import { supabase } from './supabase'
import { generateRegionName, generateSettlementName } from './nameGenerator'
import { seedNPCUnits } from './seedNPCUnits'
import { seedNPCFactions } from './seedNPCFactions'

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

const TERRAIN_WALK_DAYS: Record<string, number | null> = {
  plains: 7, forest: 9, mountains: null, ocean: null,
  desert: 9, swamp: 14, hills: 9
}

const TERRAIN_RESOURCES: Record<string, { item: string; tag: string; monthly_max: number; tokens_per_day: number; tokens_per_unit: number; hidden?: boolean; required_skill?: string; rare?: boolean }[]> = {
  plains:  [
    { item: 'grain', tag: 'grai', monthly_max: 30, tokens_per_day: 1, tokens_per_unit: 30 },
    { item: 'cattle', tag: 'catt', monthly_max: 15, tokens_per_day: 1, tokens_per_unit: 30 },
    { item: 'horses', tag: 'hrse', monthly_max: 5, tokens_per_day: 1, tokens_per_unit: 30 },
  ],
  forest:  [
    { item: 'wood', tag: 'wood', monthly_max: 20, tokens_per_day: 6, tokens_per_unit: 30 },
    { item: 'herbs', tag: 'herb', monthly_max: 10, tokens_per_day: 3, tokens_per_unit: 30 },
    { item: 'hide', tag: 'hide', monthly_max: 8, tokens_per_day: 3, tokens_per_unit: 30 },
    { item: 'yew', tag: 'yew_', monthly_max: 3, tokens_per_day: 2, tokens_per_unit: 30, hidden: true, required_skill: 'fore', rare: true },
  ],
  mountains: [
    { item: 'stone', tag: 'ston', monthly_max: 25, tokens_per_day: 5, tokens_per_unit: 30 },
    { item: 'iron', tag: 'iron', monthly_max: 10, tokens_per_day: 5, tokens_per_unit: 30 },
    { item: 'gems', tag: 'gems', monthly_max: 2, tokens_per_day: 1, tokens_per_unit: 30, hidden: true, required_skill: 'digg', rare: true },
  ],
  ocean:   [
    { item: 'fish', tag: 'fish', monthly_max: 40, tokens_per_day: 3, tokens_per_unit: 10 },
  ],
  desert:  [
    { item: 'stone', tag: 'ston', monthly_max: 10, tokens_per_day: 5, tokens_per_unit: 30 },
    { item: 'gems', tag: 'gems', monthly_max: 3, tokens_per_day: 1, tokens_per_unit: 30, hidden: true, required_skill: 'digg', rare: true },
  ],
  swamp:   [
    { item: 'herbs', tag: 'herb', monthly_max: 15, tokens_per_day: 3, tokens_per_unit: 30 },
    { item: 'fish', tag: 'fish', monthly_max: 12, tokens_per_day: 3, tokens_per_unit: 10 },
  ],
  hills:   [
    { item: 'stone', tag: 'ston', monthly_max: 20, tokens_per_day: 5, tokens_per_unit: 30 },
    { item: 'iron', tag: 'iron', monthly_max: 8, tokens_per_day: 5, tokens_per_unit: 30 },
    { item: 'cattle', tag: 'catt', monthly_max: 10, tokens_per_day: 1, tokens_per_unit: 30 },
  ],
}

const DIRECTIONS = ['North', 'NorthEast', 'SouthEast', 'South', 'SouthWest', 'NorthWest']

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

function calculateWages(population: number): number {
  if (population < 200) return 14
  if (population < 500) return 12
  if (population < 1000) return 11
  if (population < 3000) return 10
  if (population < 10000) return 9
  return 8
}

function calculateTaxes(population: number, wages: number): number {
  return Math.round(population * wages * 0.15)
}

function calculateEntertainment(population: number, hasSettlement: boolean): number {
  const base = Math.round(population * 0.05)
  return hasSettlement ? Math.round(base * 1.5) : base
}

function calculateRecruits(population: number, hasSettlement: boolean, settlementType: string | null) {
  if (population < 50) return {
    followers: { amount: 0, price: 0 },
    leaders: { amount: 0, price: 0 },
    heroes: { amount: 0, price: 0 }
  }
  const followerAmount = Math.floor(population * 0.02 * (0.8 + Math.random() * 0.4))
  const followerPrice = Math.floor(10 + Math.random() * 5)
  const leaderAmount = hasSettlement
    ? Math.floor(Math.random() * 2) + 1
    : Math.random() < 0.3 ? 1 : 0
  const leaderPrice = Math.floor(40 + Math.random() * 20)
  const heroRoll = Math.random()
  const heroAmount = settlementType === 'imperial' ? (heroRoll < 0.15 ? 1 : 0)
    : settlementType === 'city' ? (heroRoll < 0.05 ? 1 : 0)
    : 0
  const heroPrice = Math.floor(150 + Math.random() * 100)
  return {
    followers: { amount: followerAmount, price: followerPrice },
    leaders: { amount: leaderAmount, price: leaderPrice },
    heroes: { amount: heroAmount, price: heroPrice }
  }
}

// Generate pool of unique random loc codes
function generateUniqueLocCodes(count: number): string[] {
  const used = new Set<string>()
  const codes: string[] = []
  while (codes.length < count) {
    const num = Math.floor(Math.random() * 9000) + 1000
    const code = `L${num}`
    if (!used.has(code)) {
      used.add(code)
      codes.push(code)
    }
  }
  return codes
}

const usedInnerIds = new Set<string>()
function nextInnerLocId(): string {
  while (true) {
    const id = `IL${String(Math.floor(Math.random() * 9000) + 1000)}`
    if (!usedInnerIds.has(id)) {
      usedInnerIds.add(id)
      return id
    }
  }
}

function buildExits(
  x: number, y: number,
  grid: string[][],
  coordToCode: Record<string, string>,
  geoNames: Record<string, string>,
  width: number, height: number
) {
  const exits = []
  const isOdd = x % 2 === 1
  const dirOffsets: [number, number][] = isOdd
    ? [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]]
    : [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]

  for (let dir = 0; dir < 6; dir++) {
    const [dx, dy] = dirOffsets[dir]
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
    const destTerrain = grid[ny][nx]
    const coordKey = `${nx},${ny}`
    const destCode = coordToCode[coordKey]
    const destGeoName = geoNames[coordKey] ?? ''
    const walkDays = TERRAIN_WALK_DAYS[destTerrain]
    exits.push({
      direction: DIRECTIONS[dir],
      dest_loc_code: destCode,
      dest_terrain: destTerrain,
      dest_name: destGeoName,
      walk_days: walkDays,
      ride_days: walkDays ? Math.ceil(walkDays * 0.67) : null,
      fly_days: 4,
      sail_days: destTerrain === 'ocean' ? 4 : null,
      impassable: walkDays === null && destTerrain !== 'ocean',
      sailing_only: destTerrain === 'ocean',
    })
  }
  return exits.sort((a, b) => {
    if (a.impassable && !b.impassable) return 1
    if (!a.impassable && b.impassable) return -1
    return (a.walk_days ?? 99) - (b.walk_days ?? 99)
  })
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
  usedInnerIds.clear()

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

  // Generate unique random loc codes for every hex
  const totalHexes = width * height
  const locCodes = generateUniqueLocCodes(totalHexes)

  // Map coord key "x,y" to random loc code
  const coordToCode: Record<string, string> = {}
  let codeIndex = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      coordToCode[`${x},${y}`] = locCodes[codeIndex++]
    }
  }

  // Force imperial city to a recognizable code
  const imperialCode = 'L0001'
  coordToCode[`${cx},${cy}`] = imperialCode

  // Flood fill for region names — keyed by coord
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
          geoNames[`${cx2},${cy2}`] = regionName
          baseNames[`${cx2},${cy2}`] = baseName
        }
      }
    }
  }

  // Override center region
  const imperialRegionName = 'Imperial Heartlands'
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = distanceFromCenter(x, y, cx, cy)
      if (dist <= imperialRadius) {
        geoNames[`${x},${y}`] = imperialRegionName
        baseNames[`${x},${y}`] = 'Imperial'
      }
    }
  }

  // Generate settlements
  const settlementUsedNames = new Set<string>()
  type SettlementData = { type: string; population: number; coordKey: string }
  const settlementMap: Record<string, SettlementData> = {}

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = grid[y][x]
      if (terrain === 'ocean') continue
      const dist = distanceFromCenter(x, y, cx, cy)
      const distFactor = 1 - (dist / maxDist)
      const terrainSettleMod: Record<string, number> = {
        plains: 1.4, hills: 1.2, forest: 1.1,
        mountains: 0.4, swamp: 0.3, desert: 0.5, ocean: 0
      }
      const mod = terrainSettleMod[terrain] ?? 1.0
      const settlementChance = (0.04 + (distFactor * 0.25)) * mod
      const cityChance = 0.01 + (distFactor * 0.08)
      const townChance = 0.05 + (distFactor * 0.15)

      if (Math.random() < settlementChance) {
        const roll = Math.random()
        const type = roll < cityChance ? 'city'
          : roll < cityChance + townChance ? 'town' : 'village'
        const settlementPop = type === 'city'
          ? Math.floor(Math.random() * 7000) + 3000
          : type === 'town'
          ? Math.floor(Math.random() * 2200) + 800
          : Math.floor(Math.random() * 600) + 200
        settlementMap[`${x},${y}`] = { type, population: settlementPop, coordKey: `${x},${y}` }
      }
    }
  }

  // Force imperial city
  settlementMap[`${cx},${cy}`] = { type: 'imperial', population: 75000, coordKey: `${cx},${cy}` }

  // Name settlements
  const regionSettlements: Record<string, SettlementData[]> = {}
  for (const [coordKey, settlement] of Object.entries(settlementMap)) {
    const regionName = geoNames[coordKey]
    if (!regionSettlements[regionName]) regionSettlements[regionName] = []
    regionSettlements[regionName].push(settlement)
  }

  const settlementNames: Record<string, string> = {}
  settlementNames[`${cx},${cy}`] = 'The Imperial City'

  for (const [regionName, settlements] of Object.entries(regionSettlements)) {
    const baseName = settlements[0] ? baseNames[settlements[0].coordKey] : null
    const sorted = [...settlements].sort((a, b) => b.population - a.population)
    sorted.forEach((s, i) => {
      if (s.coordKey === `${cx},${cy}`) return
      if (i === 0 && regionName !== imperialRegionName) {
        settlementNames[s.coordKey] = generateSettlementName(baseName, settlementUsedNames)
      } else {
        settlementNames[s.coordKey] = generateSettlementName(null, settlementUsedNames)
      }
    })
  }

  // Build location rows
  const locations = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = grid[y][x]
      const coordKey = `${x},${y}`
      const lc = coordToCode[coordKey]
      const settlement = settlementMap[coordKey]
      const dist = distanceFromCenter(x, y, cx, cy)
      const isImperialLand = dist <= imperialRadius
      const isImperialCity = coordKey === `${cx},${cy}`
      const basePop = basePopulationForTerrain(terrain)
      const settlePop = settlement ? settlement.population : 0
      const totalPop = basePop + settlePop
      const wages = calculateWages(totalPop)
      const exits = buildExits(x, y, grid, coordToCode, geoNames, width, height)

      const innerLoc = settlement ? {
        id: nextInnerLocId(),
        name: settlementNames[coordKey] ?? 'Unknown',
        type: settlement.type,
        population: settlement.population,
        economics: {
          wages: calculateWages(settlement.population),
          taxes: calculateTaxes(settlement.population, calculateWages(settlement.population)),
          entertainment: calculateEntertainment(settlement.population, true),
          market: settlement.type === 'city' || settlement.type === 'imperial',
          market_days: settlement.type === 'city' || settlement.type === 'imperial' ? [15, 30] : [],
          recruits: calculateRecruits(settlement.population, true, settlement.type),
        }
      } : null

      locations.push({
        world_id: world.id,
        loc_code: lc,
        grid_x: x,
        grid_y: y,
        terrain_type: terrain,
        geographic_name: geoNames[coordKey],
        population: totalPop,
        population_optimal: totalPop,
        resources: {
          ...(innerLoc ? { population_center: innerLoc } : {}),
          is_imperial_land: isImperialLand,
          is_imperial_city: isImperialCity,
          exits,
          natural_resources: terrain === 'ocean' ? [] : (TERRAIN_RESOURCES[terrain] ?? [])
            .filter((r) => Math.random() < (r.rare ? 0.08 : 0.85))
            .map(r => ({
              item: r.item,
              tag: r.tag,
              amount: Math.floor(r.monthly_max * (0.5 + Math.random())),
              tokens_per_day: r.tokens_per_day,
              tokens_per_unit: r.tokens_per_unit,
              hidden: r.hidden ?? false,
              required_skill: r.required_skill ?? null,
            })),
        },
        economics: {
          wages,
          taxes: calculateTaxes(totalPop, wages),
          entertainment: calculateEntertainment(totalPop, !!settlement),
          market: settlement?.type === 'city' || settlement?.type === 'imperial',
          market_days: settlement?.type === 'city' || settlement?.type === 'imperial' ? [15, 30] : [],
          recruits: calculateRecruits(totalPop, !!settlement, settlement?.type ?? null),
        },
      })
    }
  }

  for (let i = 0; i < locations.length; i += 100) {
    const { error } = await supabase.from('locations').insert(locations.slice(i, i + 100))
    if (error) throw error
  }

  // Seed NPC factions if they exist
 // Seed NPC factions then units
  await seedNPCFactions(game.id)
  const { unitsCreated } = await seedNPCUnits()

  return { game, world, locationCount: locations.length, unitsCreated }
}
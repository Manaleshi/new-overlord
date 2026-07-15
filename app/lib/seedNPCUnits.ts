import { supabase } from './supabase'

// Helper to generate random unit codes
function randomCode(prefix: string): string {
  return `${prefix}${Math.floor(Math.random() * 9000) + 1000}`
}

// Helper to insert a unit and return its ID
async function insertUnit(unit: any): Promise<string> {
  const { data, error } = await supabase
    .from('units')
    .insert(unit)
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// Helper to insert skills for a unit
async function insertSkills(unitId: string, skills: { tag: string; level: number }[]) {
  if (skills.length === 0) return
  const rows = skills.map(s => ({
    unit_id: unitId,
    skill_tag: s.tag,
    level: s.level,
    experience_days: 0,
    token_progress: 0,
  }))
  const { error } = await supabase.from('unit_skills').insert(rows)
  if (error) console.error(`Failed to insert skills for unit ${unitId}:`, error.message)
}

// Helper to insert items for a unit
async function insertItems(unitId: string, items: { tag: string; quantity: number; equipped: boolean; equip_slot?: string }[]) {
  if (items.length === 0) return
  const rows = items.map(i => ({
    unit_id: unitId,
    item_tag: i.tag,
    quantity: i.quantity,
    equipped: i.equipped,
    equip_slot: i.equip_slot ?? null,
    token_progress: 0,
  }))
  const { error } = await supabase.from('unit_items').insert(rows)
  if (error) console.error(`Failed to insert items for unit ${unitId}:`, error.message)
}

export async function seedNPCUnits() {
  // Get the active game
  const { data: games } = await supabase
    .from('games')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
  if (!games || games.length === 0) throw new Error('No active game found')
  const game = games[0]

  // Get NPC factions
  const { data: factions } = await supabase
    .from('factions')
    .select('id, faction_code')
    .eq('game_id', game.id)
    .eq('is_npc', true)
  if (!factions) throw new Error('No NPC factions found')

  const factionMap: Record<string, string> = {}
  factions.forEach(f => { factionMap[f.faction_code] = f.id })

  // Get Imperial City
  const { data: imperialCity } = await supabase
    .from('locations')
    .select('id, loc_code')
    .eq('loc_code', 'L0001')
    .single()
  if (!imperialCity) throw new Error('Imperial City not found')

  // Get all imperial land locations
  let allLocations: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('locations')
      .select('id, loc_code, terrain_type, resources, grid_x, grid_y')
      .range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    allLocations = allLocations.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  if (!allLocations) throw new Error('No locations found')

  const imperialLands = allLocations.filter((l: any) => 
    l.resources?.is_imperial_land === true || l.resources?.is_imperial_land === 'true'
  )
  const imperialPopCenters = imperialLands.filter((l: any) => l.resources?.population_center)
  const imperialNonPop = imperialLands.filter((l: any) => !l.resources?.population_center && l.loc_code !== 'L0001')

  const nonImperialLocs = allLocations.filter((l: any) => 
    !l.resources?.is_imperial_land || l.resources?.is_imperial_land === 'false'
  )
  const cities = nonImperialLocs.filter((l: any) => l.resources?.population_center?.type === 'city')
  const towns = nonImperialLocs.filter((l: any) => l.resources?.population_center?.type === 'town')
  const villages = nonImperialLocs.filter((l: any) => l.resources?.population_center?.type === 'village')
  const forests = nonImperialLocs.filter((l: any) => l.terrain_type === 'forest')
  const wilderness = nonImperialLocs.filter((l: any) =>
    !l.resources?.population_center &&
    l.terrain_type !== 'ocean' &&
    l.terrain_type !== 'mountains'
  )

  console.log(`Found: ${cities.length} cities, ${towns.length} towns, ${villages.length} villages`)
  console.log(`Imperial lands: ${imperialLands.length}, pop centers: ${imperialPopCenters.length}`)
  console.log(`Forests: ${forests.length}, wilderness: ${wilderness.length}`)

  let totalUnits = 0

  // ── IMPERIALS ────────────────────────────────────────────

  // Guard Captain at Imperial City (hero leader)
  const captainId = await insertUnit({
    faction_id: factionMap['F001'],
    location_id: imperialCity.id,
    unit_code: randomCode('U'),
    name: 'Guard Captain',
    unit_type: 'leader',
    unit_race: 'men',
    is_hero: false,
    is_leader: true,
    figure_count: 1,
    upkeep_per_figure: 20,
    initiative: 3, melee: 4, defense: 5, missile: 0,
    life: 1, hits: 1, damage: 1, ranged_damage: 0,
    stealth: 0, observation: 2,
    mana_current: 0, mana_max: 0,
    attributes: { role: 'guard_captain', home: 'L0001' }
  })
  await insertSkills(captainId, [{ tag: 'cmbt', level: 2 }, { tag: 'blde', level: 2 }])
  await insertItems(captainId, [
    { tag: 'swrd', quantity: 1, equipped: true, equip_slot: 'weapon' },
    { tag: 'leat', quantity: 1, equipped: true, equip_slot: 'armor' },
    { tag: 'coif', quantity: 1, equipped: true, equip_slot: 'helmet' },
  ])
  totalUnits++

  // Imperial Guard at Imperial City
  const guardId = await insertUnit({
    faction_id: factionMap['F001'],
    location_id: imperialCity.id,
    unit_code: randomCode('U'),
    name: 'Imperial Guard',
    unit_type: 'followers',
    unit_race: 'men',
    is_hero: false,
    is_leader: false,
    figure_count: 50,
    upkeep_per_figure: 10,
    initiative: 2, melee: 3, defense: 4, missile: 0,
    life: 1, hits: 1, damage: 1, ranged_damage: 0,
    stealth: 0, observation: 1,
    mana_current: 0, mana_max: 0,
    attributes: { role: 'guard', home: 'L0001' }
  })
  await insertSkills(guardId, [{ tag: 'cmbt', level: 1 }, { tag: 'blde', level: 1 }])
  await insertItems(guardId, [
    { tag: 'swrd', quantity: 50, equipped: true, equip_slot: 'weapon' },
    { tag: 'leat', quantity: 50, equipped: true, equip_slot: 'armor' },
    { tag: 'coif', quantity: 50, equipped: true, equip_slot: 'helmet' },
  ])
  totalUnits++

  // Imperial Guard in every other imperial pop center
  for (const loc of imperialPopCenters) {
    if (loc.loc_code === 'L0001') continue
    const id = await insertUnit({
      faction_id: factionMap['F001'],
      location_id: loc.id,
      unit_code: randomCode('U'),
      name: 'Imperial Guard',
      unit_type: 'followers',
      unit_race: 'men',
      is_hero: false,
      is_leader: false,
      figure_count: 30,
      upkeep_per_figure: 10,
      initiative: 2, melee: 3, defense: 4, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 0, observation: 1,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'guard' }
    })
    await insertSkills(id, [{ tag: 'cmbt', level: 1 }, { tag: 'blde', level: 1 }])
    await insertItems(id, [
      { tag: 'swrd', quantity: 30, equipped: true, equip_slot: 'weapon' },
      { tag: 'leat', quantity: 30, equipped: true, equip_slot: 'armor' },
    ])
    totalUnits++
  }

  // Imperial Patrol on every non-pop imperial hex
  for (const loc of imperialNonPop) {
    const id = await insertUnit({
      faction_id: factionMap['F001'],
      location_id: loc.id,
      unit_code: randomCode('U'),
      name: 'Imperial Patrol',
      unit_type: 'followers',
      unit_race: 'men',
      is_hero: false,
      is_leader: false,
      figure_count: 20,
      upkeep_per_figure: 10,
      initiative: 2, melee: 2, defense: 3, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 0, observation: 1,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'patrol' }
    })
    await insertSkills(id, [{ tag: 'cmbt', level: 1 }])
    await insertItems(id, [
      { tag: 'leat', quantity: 20, equipped: true, equip_slot: 'armor' },
    ])
    totalUnits++
  }

  // ── CITIZENS ─────────────────────────────────────────────

  // City militia — 30 figures, sword + leather jerkin
  for (const loc of cities) {
    const id = await insertUnit({
      faction_id: factionMap['F002'],
      location_id: loc.id,
      unit_code: randomCode('U'),
      name: 'City Militia',
      unit_type: 'followers',
      unit_race: 'men',
      is_hero: false,
      is_leader: false,
      figure_count: 30,
      upkeep_per_figure: 10,
      initiative: 1, melee: 2, defense: 3, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 0, observation: 1,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'militia' }
    })
    await insertSkills(id, [{ tag: 'cmbt', level: 1 }])
    await insertItems(id, [
      { tag: 'swrd', quantity: 30, equipped: true, equip_slot: 'weapon' },
      { tag: 'leat', quantity: 30, equipped: true, equip_slot: 'armor' },
    ])
    totalUnits++
  }

  // Town militia — 15 figures, leather jerkin only
  for (const loc of towns) {
    const id = await insertUnit({
      faction_id: factionMap['F002'],
      location_id: loc.id,
      unit_code: randomCode('U'),
      name: 'Town Militia',
      unit_type: 'followers',
      unit_race: 'men',
      is_hero: false,
      is_leader: false,
      figure_count: 15,
      upkeep_per_figure: 10,
      initiative: 1, melee: 1, defense: 2, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 0, observation: 1,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'militia' }
    })
    await insertSkills(id, [{ tag: 'cmbt', level: 1 }])
    await insertItems(id, [
      { tag: 'leat', quantity: 15, equipped: true, equip_slot: 'armor' },
    ])
    totalUnits++
  }

  // Village watch — 5 figures, no equipment
  for (const loc of villages) {
    const id = await insertUnit({
      faction_id: factionMap['F002'],
      location_id: loc.id,
      unit_code: randomCode('U'),
      name: 'Village Watch',
      unit_type: 'followers',
      unit_race: 'men',
      is_hero: false,
      is_leader: false,
      figure_count: 5,
      upkeep_per_figure: 10,
      initiative: 0, melee: 1, defense: 1, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 0, observation: 1,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'watch' }
    })
    await insertSkills(id, [])
    await insertItems(id, [])
    totalUnits++
  }

  // ── CREATURES ────────────────────────────────────────────

  // Wolf packs in 15% of forest hexes
  const wolfHexes = forests.filter(() => Math.random() < 0.15)
  for (const loc of wolfHexes) {
    const figureCount = Math.floor(Math.random() * 8) + 5
    const id = await insertUnit({
      faction_id: factionMap['F003'],
      location_id: loc.id,
      unit_code: randomCode('U'),
      name: 'Wolf Pack',
      unit_type: 'creature',
      unit_race: 'wolves',
      is_hero: false,
      is_leader: false,
      figure_count: figureCount,
      upkeep_per_figure: 0,
      initiative: 3, melee: 2, defense: 1, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 2, observation: 2,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'predator' }
    })
    await insertSkills(id, [{ tag: 'cmbt', level: 1 }])
    totalUnits++
  }

  // ── OUTLAWS ──────────────────────────────────────────────

  // Bandit bands in roughly 1 per 8 wilderness hexes
  const outlawHexes = wilderness.filter(() => Math.random() < 0.125)
  for (const loc of outlawHexes) {
    const figureCount = Math.floor(Math.random() * 16) + 10
    const useAxe = Math.random() < 0.3
    const id = await insertUnit({
      faction_id: factionMap['F004'],
      location_id: loc.id,
      unit_code: randomCode('U'),
      name: 'Bandit Band',
      unit_type: 'followers',
      unit_race: 'men',
      is_hero: false,
      is_leader: false,
      figure_count: figureCount,
      upkeep_per_figure: 0,
      initiative: 1, melee: 2, defense: 1, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 2, observation: 1,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'bandit' }
    })
    await insertSkills(id, [{ tag: 'cmbt', level: 1 }])
    await insertItems(id, [
      { tag: useAxe ? 'baxe' : 'swrd', quantity: figureCount, equipped: true, equip_slot: 'weapon' },
    ])
    totalUnits++
  }

  // ── MERCHANTS ────────────────────────────────────────────

  // Merchant caravan at every city with a market
  for (const loc of [...cities, imperialCity]) {
    // Merchant leader
    const leaderId = await insertUnit({
      faction_id: factionMap['F005'],
      location_id: loc.id,
      unit_code: randomCode('U'),
      name: 'Merchant',
      unit_type: 'leader',
      unit_race: 'men',
      is_hero: false,
      is_leader: true,
      figure_count: 1,
      upkeep_per_figure: 20,
      initiative: 0, melee: 1, defense: 1, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 0, observation: 1,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'merchant' }
    })
    await insertSkills(leaderId, [{ tag: 'trad', level: 1 }])
    totalUnits++

    // Merchant guards
    const guardsId = await insertUnit({
      faction_id: factionMap['F005'],
      location_id: loc.id,
      unit_code: randomCode('U'),
      name: 'Caravan Guards',
      unit_type: 'followers',
      unit_race: 'men',
      is_hero: false,
      is_leader: false,
      figure_count: 10,
      upkeep_per_figure: 10,
      initiative: 1, melee: 2, defense: 2, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 0, observation: 1,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'caravan_guard' }
    })
    await insertSkills(guardsId, [{ tag: 'cmbt', level: 1 }])
    await insertItems(guardsId, [
      { tag: 'swrd', quantity: 10, equipped: true, equip_slot: 'weapon' },
    ])
    totalUnits++
  }

  return { unitsCreated: totalUnits }
}
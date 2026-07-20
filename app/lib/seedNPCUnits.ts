import { supabase } from './supabase'

function randomCode(prefix: string): string {
  return `${prefix}${Math.floor(Math.random() * 9000) + 1000}`
}

function makeUnit(overrides: any) {
  return {
    unit_code: randomCode('U'),
    unit_race: 'men',
    is_hero: false,
    is_leader: false,
    upkeep_per_figure: 10,
    initiative: 1, melee: 1, defense: 1, missile: 0,
    life: 1, hits: 1, damage: 1, ranged_damage: 0,
    stealth: 0, observation: 1,
    mana_current: 0, mana_max: 0,
    attributes: {},
    ...overrides,
  }
}

export async function seedNPCUnits() {
  const { data: games } = await supabase
    .from('games')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
  if (!games || games.length === 0) throw new Error('No active game found')
  const game = games[0]

  const { data: factions } = await supabase
    .from('factions')
    .select('id, faction_code')
    .eq('game_id', game.id)
    .eq('is_npc', true)
  if (!factions) throw new Error('No NPC factions found')

  const factionMap: Record<string, string> = {}
  factions.forEach(f => { factionMap[f.faction_code] = f.id })

  const { data: imperialCity } = await supabase
    .from('locations')
    .select('id, loc_code')
    .eq('loc_code', 'L0001')
    .single()
  if (!imperialCity) throw new Error('Imperial City not found')

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

  const unitRows: any[] = []
  const pendingSkills: { unitIndex: number; tag: string; level: number; experience_days: number }[] = []
  const pendingItems: { unitIndex: number; tag: string; quantity: number; equipped: boolean; equip_slot?: string }[] = []

  function addUnit(
    unit: any,
    skills: { tag: string; level: number; experience_days: number }[],
    items: { tag: string; quantity: number; equipped: boolean; equip_slot?: string }[]
  ) {
    const index = unitRows.length
    unitRows.push(unit)
    skills.forEach(s => pendingSkills.push({ unitIndex: index, ...s }))
    items.forEach(i => pendingItems.push({ unitIndex: index, ...i }))
  }

  // ── IMPERIALS ────────────────────────────────────────────

  addUnit(makeUnit({
    faction_id: factionMap['F001'],
    location_id: imperialCity.id,
    name: 'Guard Captain',
    unit_type: 'leader',
    is_leader: true,
    figure_count: 1,
    upkeep_per_figure: 20,
    initiative: 3, melee: 4, defense: 5,
    observation: 2,
    attributes: { role: 'guard_captain', home: 'L0001' }
  }),
  [{ tag: 'cmbt', level: 2, experience_days: 60 }, { tag: 'blde', level: 2, experience_days: 60 }],
  [{ tag: 'swrd', quantity: 1, equipped: true, equip_slot: 'weapon' },
   { tag: 'leat', quantity: 1, equipped: true, equip_slot: 'armor' },
   { tag: 'coif', quantity: 1, equipped: true, equip_slot: 'helmet' }])

  addUnit(makeUnit({
    faction_id: factionMap['F001'],
    location_id: imperialCity.id,
    name: 'Imperial Guard',
    unit_type: 'followers',
    figure_count: 50,
    initiative: 2, melee: 3, defense: 4,
    attributes: { role: 'guard', home: 'L0001' }
  }),
  [{ tag: 'cmbt', level: 1, experience_days: 15 }, { tag: 'blde', level: 1, experience_days: 15 }],
  [{ tag: 'swrd', quantity: 50, equipped: true, equip_slot: 'weapon' },
   { tag: 'leat', quantity: 50, equipped: true, equip_slot: 'armor' },
   { tag: 'coif', quantity: 50, equipped: true, equip_slot: 'helmet' }])

  for (const loc of imperialPopCenters) {
    if (loc.loc_code === 'L0001') continue
    addUnit(makeUnit({
      faction_id: factionMap['F001'],
      location_id: loc.id,
      name: 'Imperial Guard',
      unit_type: 'followers',
      figure_count: 30,
      initiative: 2, melee: 3, defense: 4,
      attributes: { role: 'guard' }
    }),
    [{ tag: 'cmbt', level: 1, experience_days: 15 }, { tag: 'blde', level: 1, experience_days: 15 }],
    [{ tag: 'swrd', quantity: 30, equipped: true, equip_slot: 'weapon' },
     { tag: 'leat', quantity: 30, equipped: true, equip_slot: 'armor' }])
  }

  for (const loc of imperialNonPop) {
    addUnit(makeUnit({
      faction_id: factionMap['F001'],
      location_id: loc.id,
      name: 'Imperial Patrol',
      unit_type: 'followers',
      figure_count: 20,
      initiative: 2, melee: 2, defense: 3,
      attributes: { role: 'patrol' }
    }),
    [{ tag: 'cmbt', level: 1, experience_days: 15 }],
    [{ tag: 'leat', quantity: 20, equipped: true, equip_slot: 'armor' }])
  }

  // ── CITIZENS ─────────────────────────────────────────────

  for (const loc of cities) {
    addUnit(makeUnit({
      faction_id: factionMap['F002'],
      location_id: loc.id,
      name: 'City Militia',
      unit_type: 'followers',
      figure_count: 30,
      melee: 2, defense: 3,
      attributes: { role: 'militia' }
    }),
    [{ tag: 'cmbt', level: 1, experience_days: 15 }],
    [{ tag: 'swrd', quantity: 30, equipped: true, equip_slot: 'weapon' },
     { tag: 'leat', quantity: 30, equipped: true, equip_slot: 'armor' }])
  }

  for (const loc of towns) {
    addUnit(makeUnit({
      faction_id: factionMap['F002'],
      location_id: loc.id,
      name: 'Town Militia',
      unit_type: 'followers',
      figure_count: 15,
      melee: 1, defense: 2,
      attributes: { role: 'militia' }
    }),
    [{ tag: 'cmbt', level: 1, experience_days: 15 }],
    [{ tag: 'leat', quantity: 15, equipped: true, equip_slot: 'armor' }])
  }

  for (const loc of villages) {
    addUnit(makeUnit({
      faction_id: factionMap['F002'],
      location_id: loc.id,
      name: 'Village Watch',
      unit_type: 'followers',
      figure_count: 5,
      initiative: 0, melee: 1, defense: 1,
      attributes: { role: 'watch' }
    }), [], [])
  }

  // ── CREATURES ────────────────────────────────────────────

  const wolfHexes = forests.filter(() => Math.random() < 0.15)
  for (const loc of wolfHexes) {
    const figureCount = Math.floor(Math.random() * 8) + 5
    addUnit(makeUnit({
      faction_id: factionMap['F003'],
      location_id: loc.id,
      name: 'Wolf Pack',
      unit_type: 'creature',
      unit_race: 'wolves',
      figure_count: figureCount,
      upkeep_per_figure: 0,
      initiative: 3, melee: 2, defense: 1,
      stealth: 2, observation: 2,
      attributes: { role: 'predator' }
    }),
    [{ tag: 'cmbt', level: 1, experience_days: 15 }], [])
  }

  // ── OUTLAWS ──────────────────────────────────────────────

  const outlawHexes = wilderness.filter(() => Math.random() < 0.125)
  for (const loc of outlawHexes) {
    const figureCount = Math.floor(Math.random() * 16) + 10
    const useAxe = Math.random() < 0.3
    addUnit(makeUnit({
      faction_id: factionMap['F004'],
      location_id: loc.id,
      name: 'Bandit Band',
      unit_type: 'followers',
      figure_count: figureCount,
      upkeep_per_figure: 0,
      melee: 2,
      stealth: 2,
      attributes: { role: 'bandit' }
    }),
    [{ tag: 'cmbt', level: 1, experience_days: 15 }],
    [{ tag: useAxe ? 'baxe' : 'swrd', quantity: figureCount, equipped: true, equip_slot: 'weapon' }])
  }

  // ── MERCHANTS ────────────────────────────────────────────

  for (const loc of [...cities, imperialCity]) {
    addUnit(makeUnit({
      faction_id: factionMap['F005'],
      location_id: loc.id,
      name: 'Merchant',
      unit_type: 'leader',
      is_leader: true,
      figure_count: 1,
      upkeep_per_figure: 20,
      initiative: 0,
      attributes: { role: 'merchant' }
    }),
    [{ tag: 'trad', level: 1, experience_days: 15 }], [])

    addUnit(makeUnit({
      faction_id: factionMap['F005'],
      location_id: loc.id,
      name: 'Caravan Guards',
      unit_type: 'followers',
      figure_count: 10,
      melee: 2, defense: 2,
      attributes: { role: 'caravan_guard' }
    }),
    [{ tag: 'cmbt', level: 1, experience_days: 15 }],
    [{ tag: 'swrd', quantity: 10, equipped: true, equip_slot: 'weapon' }])
  }

  // ── BATCH INSERT ─────────────────────────────────────────

  const insertedIds: string[] = []
  for (let i = 0; i < unitRows.length; i += 100) {
    const batch = unitRows.slice(i, i + 100)
    const { data, error } = await supabase.from('units').insert(batch).select('id')
    if (error) throw error
    data.forEach((u: any) => insertedIds.push(u.id))
  }

  const skillRows: any[] = []
  for (const ps of pendingSkills) {
    const unitId = insertedIds[ps.unitIndex]
    if (!unitId) continue
    skillRows.push({
      unit_id: unitId,
      skill_tag: ps.tag,
      level: ps.level,
      experience_days: ps.experience_days,
      token_progress: 0,
    })
  }

  const itemRows: any[] = []
  for (const pi of pendingItems) {
    const unitId = insertedIds[pi.unitIndex]
    if (!unitId) continue
    itemRows.push({
      unit_id: unitId,
      item_tag: pi.tag,
      quantity: pi.quantity,
      equipped: pi.equipped,
      equip_slot: pi.equip_slot ?? null,
      token_progress: 0,
    })
  }

  for (let i = 0; i < skillRows.length; i += 100) {
    const { error } = await supabase.from('unit_skills').insert(skillRows.slice(i, i + 100))
    if (error) console.error('Skill insert error:', error.message)
  }

  for (let i = 0; i < itemRows.length; i += 100) {
    const { error } = await supabase.from('unit_items').insert(itemRows.slice(i, i + 100))
    if (error) console.error('Item insert error:', error.message)
  }

  return { unitsCreated: insertedIds.length }
}
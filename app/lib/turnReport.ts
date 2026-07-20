import { supabase } from './supabase'

interface TurnReportData {
  faction: any
  player: any
  units: any[]
  locations: any[]
  game: any
}

async function getFactionData(factionId: string): Promise<TurnReportData | null> {
  // Get game
  const { data: games } = await supabase
    .from('games')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
  if (!games || games.length === 0) return null
  const game = games[0]

  // Get faction
  const { data: faction } = await supabase
    .from('factions')
    .select('*')
    .eq('id', factionId)
    .single()
  if (!faction) return null

  // Get player
  const { data: player } = faction.player_id ? await supabase
    .from('players')
    .select('email')
    .eq('id', faction.player_id)
    .single() : { data: null }

  // Get units
  const { data: units } = await supabase
    .from('units')
    .select('*')
    .eq('faction_id', factionId)

  // Get unit skills and items
  const unitsWithDetails = await Promise.all((units ?? []).map(async (unit) => {
    const { data: skills } = await supabase
      .from('unit_skills')
      .select('*, skill_defs(name, tag)')
      .eq('unit_id', unit.id)

    const { data: items } = await supabase
      .from('unit_items')
      .select('*, item_defs(name, tag)')
      .eq('unit_id', unit.id)

    return { ...unit, skills: skills ?? [], items: items ?? [] }
  }))

  // Get unique locations where units are
  const locationIds = [...new Set((units ?? []).map(u => u.location_id).filter(Boolean))]
  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .in('id', locationIds)

  return { faction, player, units: unitsWithDetails, locations: locations ?? [], game }
}

function ordinalLevel(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

function formatUnit(unit: any): string {
  const lines: string[] = []

  // Unit header
  const location = unit.location_id ? `at [${unit.location_id}]` : 'location unknown'
  lines.push(`${unit.name} [${unit.unit_code}] — ${unit.figure_count} ${unit.unit_type}`)

  // Items
  if (unit.items && unit.items.length > 0) {
    const itemList = unit.items.map((i: any) => {
      const name = i.item_defs?.name ?? i.item_tag
      const tag = i.item_tag
      const equipped = i.equipped ? ' (equipped)' : ''
      return `${i.quantity} ${name}[${tag}]${equipped}`
    }).join(', ')
    lines.push(`  Has: ${itemList}`)
  }

  // Skills
  if (unit.skills && unit.skills.length > 0) {
    const skillList = unit.skills.map((s: any) => {
      const name = s.skill_defs?.name ?? s.skill_tag
      const tag = s.skill_tag
      return `${ordinalLevel(s.level)} ${name}[${tag}] (${s.experience_days})`
    }).join(', ')
    lines.push(`  Skills: ${skillList}`)
  }

  // Stats
  lines.push(`  Stats: init: ${unit.initiative}, att: ${unit.melee}, def: ${unit.defense}, dmg: ${unit.damage}, life: ${unit.life}`)
  lines.push(`  Upkeep: ${unit.upkeep_per_figure * unit.figure_count} coins`)

  return lines.join('\n')
}

function formatLocation(location: any, factionUnits: any[]): string {
  const lines: string[] = []
  const r = location.resources ?? {}
  const e = location.economics ?? {}
  const pc = r.population_center

  lines.push(`${location.geographic_name ?? location.loc_code} [${location.loc_code}] — ${location.terrain_type}`)

  if (pc) {
    lines.push(`  Settlement: ${pc.name} (${pc.type}, pop ${pc.population.toLocaleString()})`)
  }

  lines.push(`  Population: ${location.population.toLocaleString()}`)

  if (e.wages) {
    lines.push(`  Wages: $${e.wages}/figure  Taxes: $${e.taxes}  Entertainment: $${e.entertainment}`)
  }

  if (r.natural_resources && r.natural_resources.length > 0) {
    const visible = r.natural_resources.filter((res: any) => !res.hidden)
    if (visible.length > 0) {
      const resList = visible.map((res: any) => `${res.item} [${res.tag}]: ${res.amount}`).join(', ')
      lines.push(`  Resources: ${resList}`)
    }
  }

  if (r.exits && r.exits.length > 0) {
    lines.push(`  Exits:`)
    for (const exit of r.exits) {
      if (exit.impassable) {
        lines.push(`    ${exit.direction} — ${exit.dest_name} [${exit.dest_loc_code}] (${exit.dest_terrain}) — impassable`)
      } else if (exit.sailing_only) {
        lines.push(`    ${exit.direction} — ${exit.dest_name} [${exit.dest_loc_code}] (${exit.dest_terrain}) — ${exit.sail_days}d sailing`)
      } else {
        lines.push(`    ${exit.direction} — ${exit.dest_name} [${exit.dest_loc_code}] (${exit.dest_terrain}) walk ${exit.walk_days}d/ride ${exit.ride_days}d/fly 4d`)
      }
    }
  }

  if (r.is_imperial_land) {
    lines.push(`  ⚜️ Imperial Lands`)
  }

  return lines.join('\n')
}

function formatOrderTemplate(faction: any, units: any[], game: any): string {
  const lines: string[] = []
  lines.push(`GAME ${faction.faction_code} yourpassword ${game.name}`)
  lines.push(``)

  for (const unit of units) {
    lines.push(`UNIT ${unit.unit_code}`)
    lines.push(`; Enter orders for ${unit.name} here`)
    lines.push(``)
  }

  lines.push(`END`)
  return lines.join('\n')
}

export async function generateTurnReport(factionId: string): Promise<string> {
  const data = await getFactionData(factionId)
  if (!data) return 'Error: faction not found'

  const { faction, player, units, locations, game } = data
  const lines: string[] = []

  // Header
  lines.push(`---------------------------------------------------`)
  lines.push(`NEW OVERLORD — Turn ${game.turn_number} Report for ${faction.name} [${faction.faction_code}]`)
  if (player?.email) lines.push(`Player: ${player.email}`)
  lines.push(`Next turn: TBD`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)

  // Faction stats
  lines.push(`// Faction Stats`)
  lines.push(`Faction funds: ${faction.funds.toLocaleString()} coins [coin]`)
  lines.push(`Control Points: ${units.reduce((acc: number, u: any) => acc + Math.ceil(u.figure_count / 20), 0)} of ${faction.control_points_max}`)
  lines.push(``)

  // Diplomacy
  lines.push(`// Diplomacy`)
  lines.push(`Default attitude: ${faction.stances?.default ?? 'Neutral'}`)
  if (faction.stances?.specific) {
    for (const [code, stance] of Object.entries(faction.stances.specific)) {
      lines.push(`Attitude to [${code}]: ${stance}`)
    }
  }
  lines.push(``)

  // Global events (placeholder for now)
  lines.push(`---------------------------------------------------`)
  lines.push(`// Global Events`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)
  lines.push(`  Nothing to report this turn.`)
  lines.push(``)

  // Units
  lines.push(`---------------------------------------------------`)
  lines.push(`// Units`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)

  for (const unit of units) {
    lines.push(formatUnit(unit))
    lines.push(``)
    lines.push(`  ${unit.name} [${unit.unit_code}]'s actions this turn:`)
    lines.push(`  Day 1 — Unit awaiting orders`)
    lines.push(``)
  }

  // Locations
  lines.push(`---------------------------------------------------`)
  lines.push(`// Locations`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)

  for (const location of locations) {
    const factionUnitsHere = units.filter(u => u.location_id === location.id)
    lines.push(formatLocation(location, factionUnitsHere))
    lines.push(``)
  }

  // Knowledge
  lines.push(`---------------------------------------------------`)
  lines.push(`// New Knowledge`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)
  lines.push(`  Nothing new this turn.`)
  lines.push(``)

  // Order template
  lines.push(`---------------------------------------------------`)
  lines.push(`// Order Template — Turn ${game.turn_number + 1}`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)
  lines.push(formatOrderTemplate(faction, units, game))

  return lines.join('\n')
}
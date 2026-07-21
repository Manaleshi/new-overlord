import { supabase } from './supabase'

interface TurnReportData {
  faction: any
  player: any
  units: any[]
  locations: any[]
  game: any
  otherUnits: any[]
  skillDefs: any[]
  itemDefs: any[]
}

async function getFactionData(factionId: string): Promise<TurnReportData | null> {
  const { data: games } = await supabase
    .from('games')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
  if (!games || games.length === 0) return null
  const game = games[0]

  const { data: faction } = await supabase
    .from('factions')
    .select('*')
    .eq('id', factionId)
    .single()
  if (!faction) return null

  const { data: player } = faction.player_id ? await supabase
    .from('players')
    .select('email')
    .eq('id', faction.player_id)
    .single() : { data: null }

  const { data: units } = await supabase
    .from('units')
    .select('*')
    .eq('faction_id', factionId)

  const unitsWithDetails = await Promise.all((units ?? []).map(async (unit) => {
    const { data: skills } = await supabase
      .from('unit_skills')
      .select('*, skill_defs(name, tag, effects)')
      .eq('unit_id', unit.id)

    const { data: items } = await supabase
      .from('unit_items')
      .select('*, item_defs(name, tag, effects, equip_slot, weight)')
      .eq('unit_id', unit.id)

    return { ...unit, skills: skills ?? [], items: items ?? [] }
  }))

  const locationIds = [...new Set((units ?? []).map(u => u.location_id).filter(Boolean))]
  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .in('id', locationIds)

  // Get other units at same locations
  const { data: otherUnits } = await supabase
    .from('units')
    .select('unit_code, name, unit_type, figure_count, faction_id, location_id, stealth, observation, factions(faction_code, name, faction_type)')
    .in('location_id', locationIds)
    .neq('faction_id', factionId)

  // Get all skill and item defs for knowledge section
  const { data: skillDefs } = await supabase.from('skill_defs').select('*')
  const { data: itemDefs } = await supabase.from('item_defs').select('*')

  return {
    faction,
    player,
    units: unitsWithDetails,
    locations: locations ?? [],
    game,
    otherUnits: otherUnits ?? [],
    skillDefs: skillDefs ?? [],
    itemDefs: itemDefs ?? [],
  }
}

function ordinalLevel(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

function isVisible(observer: any, target: any): boolean {
  // Observer's best observation stat from all their units
  const obs = observer
  const stealthDiff = target.stealth - obs
  if (stealthDiff <= 0) return true
  // 10% chance per level of difference to avoid being seen
  const chanceHidden = stealthDiff * 0.10
  return Math.random() > chanceHidden
}

function formatUnit(unit: any): string {
  const lines: string[] = []

  lines.push(`${unit.name} [${unit.unit_code}] - ${unit.figure_count} ${unit.unit_type}`)

  if (unit.items && unit.items.length > 0) {
    const itemList = unit.items.map((i: any) => {
      const name = i.item_defs?.name ?? i.item_tag
      const tag = i.item_tag
      const equipped = i.equipped ? ' (equipped)' : ''
      return `${i.quantity} ${name}[${tag}]${equipped}`
    }).join(', ')
    lines.push(`  Has: ${itemList}`)
  }

  if (unit.skills && unit.skills.length > 0) {
    const skillList = unit.skills.map((s: any) => {
      const name = s.skill_defs?.name ?? s.skill_tag
      const tag = s.skill_tag
      return `${ordinalLevel(s.level)} ${name}[${tag}] (${s.experience_days})`
    }).join(', ')
    lines.push(`  Skills: ${skillList}`)
  }

  lines.push(`  Stats: init: ${unit.initiative}, att: ${unit.melee}, def: ${unit.defense}, dmg: ${unit.damage}, life: ${unit.life}`)
  lines.push(`  Upkeep: ${unit.upkeep_per_figure * unit.figure_count} coins`)

  return lines.join('\n')
}

function formatLocation(location: any, factionUnits: any[], otherUnits: any[], factionObservation: number): string {
  const lines: string[] = []
  const r = location.resources ?? {}
  const e = location.economics ?? {}
  const pc = r.population_center

  lines.push(`${location.geographic_name ?? location.loc_code} [${location.loc_code}] - ${location.terrain_type}`)

  if (pc) {
    lines.push(`  Settlement: ${pc.name} (${pc.type}, pop ${pc.population?.toLocaleString()})`)
  }

  lines.push(`  Population: ${location.population?.toLocaleString()}`)

  if (e.wages) {
    lines.push(`  Wages: $${e.wages}/figure  Taxes: $${e.taxes}  Entertainment: $${e.entertainment}`)
  }

  if (e.recruits) {
    const rec = e.recruits
    const parts = []
    if (rec.followers?.amount > 0) parts.push(`${rec.followers.amount} followers @ $${rec.followers.price}`)
    if (rec.leaders?.amount > 0) parts.push(`${rec.leaders.amount} leaders @ $${rec.leaders.price}`)
    if (rec.heroes?.amount > 0) parts.push(`${rec.heroes.amount} hero @ $${rec.heroes.price}`)
    if (parts.length > 0) lines.push(`  Recruits: ${parts.join(', ')}`)
  }

  if (r.natural_resources && r.natural_resources.length > 0) {
    const visible = r.natural_resources.filter((res: any) => !res.hidden)
    if (visible.length > 0) {
      const resList = visible.map((res: any) => `${res.item}[${res.tag}]: ${res.amount}`).join(', ')
      lines.push(`  Resources: ${resList}`)
    }
  }

  if (e.market) {
    lines.push(`  Market days: ${e.market_days?.join(' & ')}`)
  }

  if (r.is_imperial_land) {
    lines.push(`  Imperial Lands`)
  }

  if (r.exits && r.exits.length > 0) {
    lines.push(`  Exits:`)
    for (const exit of r.exits) {
      if (exit.impassable) {
        lines.push(`    ${exit.direction} - ${exit.dest_name} [${exit.dest_loc_code}] (${exit.dest_terrain}) - impassable`)
      } else if (exit.sailing_only) {
        lines.push(`    ${exit.direction} - ${exit.dest_name} [${exit.dest_loc_code}] (${exit.dest_terrain}) - ${exit.sail_days}d sailing`)
      } else {
        lines.push(`    ${exit.direction} - ${exit.dest_name} [${exit.dest_loc_code}] (${exit.dest_terrain}) walk ${exit.walk_days}d/ride ${exit.ride_days}d/fly 4d`)
      }
    }
  }

  // Own units at this location
  const ownUnitsHere = factionUnits.filter((u: any) => u.location_id === location.id)
  if (ownUnitsHere.length > 0) {
    lines.push(`  Your units:`)
    for (const u of ownUnitsHere) {
      lines.push(`    ${u.name} [${u.unit_code}] - ${u.figure_count} ${u.unit_type}`)
    }
  }

  // Other units visible at this location
  const othersHere = otherUnits.filter((u: any) => u.location_id === location.id)
  const visibleOthers = othersHere.filter((u: any) => isVisible(factionObservation, u))

  if (visibleOthers.length > 0) {
    lines.push(`  Also present:`)
    for (const u of visibleOthers) {
      const factionName = u.factions?.name ?? 'Unknown'
      const factionCode = u.factions?.faction_code ?? '?'
      const advertised = u.factions?.faction_type !== 'player'
      lines.push(`    ${u.name} [${u.unit_code}] - ${u.figure_count} ${u.unit_type}${advertised ? ` (${factionName} [${factionCode}])` : ''}`)
    }
  }

  return lines.join('\n')
}

export async function generateTurnReport(factionId: string): Promise<string> {
  const data = await getFactionData(factionId)
  if (!data) return 'Error: faction not found'

  const { faction, player, units, locations, game, otherUnits, skillDefs, itemDefs } = data
  const lines: string[] = []

  // Best observation across all faction units
  const factionObservation = Math.max(...units.map(u => u.observation ?? 0), 0)

  lines.push(`---------------------------------------------------`)
  lines.push(`NEW OVERLORD - Turn ${game.turn_number} Report`)
  lines.push(`${faction.name} [${faction.faction_code}]`)
  if (player?.email) lines.push(`Player: ${player.email}`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)

  lines.push(`// Faction Stats`)
  lines.push(`Faction funds: ${faction.funds.toLocaleString()} coins [coin]`)
  const usedCP = units.reduce((acc: number, u: any) => acc + Math.ceil(u.figure_count / 20), 0)
  lines.push(`Control Points: ${usedCP} of ${faction.control_points_max}`)
  lines.push(``)

  lines.push(`// Diplomacy`)
  lines.push(`Default attitude: ${faction.stances?.default ?? 'Neutral'}`)
  if (faction.stances?.specific) {
    for (const [code, stance] of Object.entries(faction.stances.specific)) {
      lines.push(`Attitude to [${code}]: ${stance}`)
    }
  }
  lines.push(``)

  lines.push(`---------------------------------------------------`)
  lines.push(`// Global Events`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)
  lines.push(`  Nothing to report this turn.`)
  lines.push(``)

  lines.push(`---------------------------------------------------`)
  lines.push(`// Units`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)

  for (const unit of units) {
    lines.push(formatUnit(unit))
    lines.push(``)
    lines.push(`  ${unit.name} [${unit.unit_code}]'s actions this turn:`)
    lines.push(`  Day 1 - Unit awaiting orders`)
    lines.push(``)
  }

  lines.push(`---------------------------------------------------`)
  lines.push(`// Locations`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)

  for (const location of locations) {
    lines.push(formatLocation(location, units, otherUnits, factionObservation))
    lines.push(``)
  }

  // Knowledge section
  lines.push(`---------------------------------------------------`)
  lines.push(`// Knowledge`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)

  // Collect all unique skill tags from this faction's units
  const knownSkillTags = [...new Set(units.flatMap((u: any) => u.skills.map((s: any) => s.skill_tag)))]
  const knownItemTags = [...new Set(units.flatMap((u: any) => u.items.map((i: any) => i.item_tag)))]

  if (knownSkillTags.length > 0) {
    lines.push(`  Skills known:`)
    for (const tag of knownSkillTags) {
      const def = skillDefs.find((s: any) => s.tag === tag)
      if (def) {
        lines.push(``)
        lines.push(`  ${ordinalLevel(1)} ${def.name} [${def.tag}]`)
        lines.push(`    Requires ${def.days_per_level} days and $${def.cost_per_day}/day to study.`)
        if (def.is_magic) lines.push(`    This is a magic skill.`)
        if (def.leader_only) lines.push(`    Leaders only.`)
      }
    }
    lines.push(``)
  }

  if (knownItemTags.length > 0) {
    lines.push(`  Items known:`)
    for (const tag of knownItemTags) {
      const def = itemDefs.find((i: any) => i.tag === tag)
      if (def) {
        lines.push(``)
        lines.push(`  ${def.name} [${def.tag}]`)
        lines.push(`    Weight: ${def.weight}.${def.equip_slot ? ` Equipment slot: ${def.equip_slot}.` : ''}`)
        if (def.effects && Object.keys(def.effects).length > 0) {
          const effectList = Object.entries(def.effects).map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`).join(', ')
          lines.push(`    Effects: ${effectList}`)
        }
      }
    }
    lines.push(``)
  }

  // Order template
  lines.push(`---------------------------------------------------`)
  lines.push(`// Order Template - Turn ${game.turn_number + 1}`)
  lines.push(`---------------------------------------------------`)
  lines.push(``)
  lines.push(`#GAME ${faction.faction_code} yourpassword ${game.name}`)
  lines.push(``)

  for (const unit of units) {
    lines.push(`UNIT ${unit.unit_code}`)
    lines.push(`; Enter orders for ${unit.name} here`)
    lines.push(``)
  }

  lines.push(`#END`)

  return lines.join('\n')
}
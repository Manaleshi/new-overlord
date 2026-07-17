import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../lib/supabase'
import { sendEmail } from '../../lib/email'
import bcrypt from 'bcryptjs'

function randomFactionCode(): string {
  return `F${Math.floor(Math.random() * 9000) + 1000}`
}

async function findStartingLocation(zone: string): Promise<any> {
  if (zone === 'imperial') {
    const { data } = await supabase
      .from('locations')
      .select('id, loc_code, resources, geographic_name')
      .eq('loc_code', 'L0001')
      .single()
    return data
  }

  if (zone === 'borders') {
    const { data } = await supabase
      .from('locations')
      .select('id, loc_code, resources, geographic_name')
    const imperial = data?.filter((l: any) =>
      l.resources?.is_imperial_land === true &&
      l.resources?.population_center &&
      l.loc_code !== 'L0001'
    )
    if (!imperial || imperial.length === 0) return null
    return imperial[Math.floor(Math.random() * imperial.length)]
  }

  // Colonial — find a city or town outside imperial lands
  const { data } = await supabase
    .from('locations')
    .select('id, loc_code, resources, geographic_name')
  const colonial = data?.filter((l: any) =>
    !l.resources?.is_imperial_land &&
    l.resources?.population_center &&
    ['city', 'town'].includes(l.resources.population_center.type)
  )
  if (!colonial || colonial.length === 0) return null
  return colonial[Math.floor(Math.random() * colonial.length)]
}

function getStartingBonus(zone: string): number {
  if (zone === 'imperial') return 1000
  if (zone === 'borders') return 500
  return 0
}

function getStartingSkills(leaderType: string, element: string): { tag: string; level: number }[] {
  switch (leaderType) {
    case 'general':
      return [{ tag: 'cmbt', level: 1 }, { tag: 'blde', level: 1 }]
    case 'mage':
      const elemTag: Record<string, string> = {
        fire: 'fire', water: 'watr', earth: 'eart', air: 'air_', void: 'void'
      }
      return [{ tag: 'mage', level: 1 }, { tag: elemTag[element] ?? 'fire', level: 1 }]
    case 'adventurer':
      return [{ tag: 'scou', level: 1 }]
    case 'craftsman':
      return [{ tag: 'lumb', level: 1 }, { tag: 'digg', level: 1 }]
    default:
      return [{ tag: 'cmbt', level: 1 }]
  }
}

function getStartingItems(leaderType: string): { tag: string; quantity: number; equipped: boolean; equip_slot?: string }[] {
  switch (leaderType) {
    case 'general':
      return [
        { tag: 'swrd', quantity: 1, equipped: true, equip_slot: 'weapon' },
        { tag: 'leat', quantity: 1, equipped: true, equip_slot: 'armor' },
        { tag: 'hrse', quantity: 1, equipped: true, equip_slot: 'mount' },
      ]
    case 'mage':
      return [
        { tag: 'hrse', quantity: 1, equipped: true, equip_slot: 'mount' },
      ]
    case 'adventurer':
      return [
        { tag: 'hrse', quantity: 1, equipped: true, equip_slot: 'mount' },
        { tag: 'food', quantity: 30, equipped: false },
      ]
    case 'craftsman':
      return [
        { tag: 'tool', quantity: 2, equipped: false },
        { tag: 'hrse', quantity: 1, equipped: true, equip_slot: 'mount' },
      ]
    default:
      return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, leader_type, element, starting_zone } = await req.json()

    // Validate
    if (!email || !password || !leader_type || !starting_zone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    if (leader_type === 'mage' && !element) {
      return NextResponse.json({ error: 'Mages must choose an element' }, { status: 400 })
    }

    // Check email not already registered
    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('email', email)
      .single()
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }

    // Get active game
    const { data: games } = await supabase
      .from('games')
      .select('id, turn_number')
      .order('created_at', { ascending: false })
      .limit(1)
    if (!games || games.length === 0) {
      return NextResponse.json({ error: 'No active game found' }, { status: 400 })
    }
    const game = games[0]

    // Find starting location
    const startingLocation = await findStartingLocation(starting_zone)
    if (!startingLocation) {
      return NextResponse.json({ error: 'No starting location available for that zone' }, { status: 400 })
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10)

    // Create player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ email, password_hash, display_name: email.split('@')[0] })
      .select()
      .single()
    if (playerError) throw playerError

    // Generate unique faction code
    let faction_code = randomFactionCode()
    let attempts = 0
    while (attempts < 20) {
      const { data: existing } = await supabase
        .from('factions')
        .select('id')
        .eq('faction_code', faction_code)
        .single()
      if (!existing) break
      faction_code = randomFactionCode()
      attempts++
    }

    // Create faction
    const startingFunds = 5000 + getStartingBonus(starting_zone)
    const { data: faction, error: factionError } = await supabase
      .from('factions')
      .insert({
        game_id: game.id,
        player_id: player.id,
        faction_code,
        name: `Faction ${faction_code}`,
        faction_type: 'player',
        is_npc: false,
        funds: startingFunds,
        control_points_max: 200,
        status: 'active',
        joined_turn: game.turn_number,
        stances: { default: 'neutral', specific: { F001: 'friendly', F002: 'friendly', F003: 'enemy', F004: 'enemy', F005: 'friendly' } },
        attributes: { leader_type, element: element || null, starting_zone },
        starting_location: startingLocation.loc_code,
      })
      .select()
      .single()
    if (factionError) throw factionError

    // Create hero unit
    const heroCode = `U${Math.floor(Math.random() * 9000) + 1000}`
    const { data: hero, error: heroError } = await supabase
      .from('units')
      .insert({
        faction_id: faction.id,
        location_id: startingLocation.id,
        unit_code: heroCode,
        name: 'Hero',
        unit_type: 'leader',
        unit_race: 'men',
        is_hero: true,
        is_leader: true,
        figure_count: 1,
        upkeep_per_figure: 20,
        initiative: 2, melee: 2, defense: 2, missile: 0,
        life: 1, hits: 1, damage: 1, ranged_damage: 0,
        stealth: 1, observation: 2,
        mana_current: leader_type === 'mage' ? 10 : 0,
        mana_max: leader_type === 'mage' ? 10 : 0,
        attributes: { role: 'hero', leader_type }
      })
      .select()
      .single()
    if (heroError) throw heroError

    // Hero skills
    const heroSkills = getStartingSkills(leader_type, element)
    if (heroSkills.length > 0) {
      await supabase.from('unit_skills').insert(
        heroSkills.map(s => ({
          unit_id: hero.id,
          skill_tag: s.tag,
          level: s.level,
          experience_days: 0,
          token_progress: 0,
        }))
      )
    }

    // Hero items
    const heroItems = getStartingItems(leader_type)
    if (heroItems.length > 0) {
      await supabase.from('unit_items').insert(
        heroItems.map(i => ({
          unit_id: hero.id,
          item_tag: i.tag,
          quantity: i.quantity,
          equipped: i.equipped,
          equip_slot: i.equip_slot ?? null,
          token_progress: 0,
        }))
      )
    }

    // Create followers unit (50 unskilled followers)
    const followersCode = `U${Math.floor(Math.random() * 9000) + 1000}`
    await supabase.from('units').insert({
      faction_id: faction.id,
      location_id: startingLocation.id,
      unit_code: followersCode,
      name: 'Followers',
      unit_type: 'followers',
      unit_race: 'men',
      is_hero: false,
      is_leader: false,
      figure_count: 50,
      upkeep_per_figure: 10,
      initiative: 0, melee: 1, defense: 1, missile: 0,
      life: 1, hits: 1, damage: 1, ranged_damage: 0,
      stealth: 0, observation: 0,
      mana_current: 0, mana_max: 0,
      attributes: { role: 'followers' }
    })

    // Send welcome email
    const settlementName = startingLocation.resources?.population_center?.name ?? startingLocation.loc_code
    const regionName = startingLocation.geographic_name ?? ''

    await sendEmail({
      to: email,
      subject: `Welcome to New Overlord — Faction ${faction_code}`,
      text: `Welcome to New Overlord!

Your faction has been created. Here are your starting details:

Faction Code: ${faction_code}
Starting Location: ${settlementName} [${startingLocation.loc_code}], ${regionName}
Starting Funds: $${startingFunds.toLocaleString()}
Leader Type: ${leader_type.charAt(0).toUpperCase() + leader_type.slice(1)}
${element ? `Element: ${element.charAt(0).toUpperCase() + element.slice(1)}\n` : ''}
Your hero [${heroCode}] and 50 followers [${followersCode}] are waiting at your starting location.

Use NAME FACTION "Your Faction Name" and NAME UNIT ${heroCode} "Your Hero Name" in your first orders to name them.

Your first turn report will arrive when the game begins.

Good luck!
— The Game Master
`
    })

    return NextResponse.json({ success: true, faction_code })

  } catch (err: any) {
    console.error('Registration error:', err)
    return NextResponse.json({ error: err.message ?? 'Registration failed' }, { status: 500 })
  }
}
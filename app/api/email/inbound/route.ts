import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'
import { sendEmail } from '../../../lib/email'
import bcrypt from 'bcryptjs'

async function handleRegistration(from: string, body: string) {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
  const data: Record<string, string> = {}

  for (const line of lines) {
    const parts = line.split(/\s+/)
    if (parts.length >= 2) {
      data[parts[0].toUpperCase()] = parts.slice(1).join(' ')
    }
  }

  const email = from
  const password = data['PASSWORD']
  const leader_type = (data['TYPE'] || 'general').toLowerCase()
  const element = (data['ELEMENT'] || '').toLowerCase()
  const starting_zone = (data['ZONE'] || 'colonial').toLowerCase()

  if (!password) {
    try {
      await sendEmail({
        to: email,
        subject: 'New Overlord — Registration Error',
        text: `Registration failed — PASSWORD is required.\n\nPlease send:\n\nREGISTER\nPASSWORD yourpassword\nTYPE general|mage|adventurer|craftsman\nZONE imperial|borders|colonial\nELEMENT fire|water|earth|air|void (mages only)`
      })
    } catch (e) { console.error('Email failed:', e) }
    return
  }

  // Check email not already registered
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) {
    try {
      await sendEmail({
        to: email,
        subject: 'New Overlord — Registration Error',
        text: `That email address is already registered.`
      })
    } catch (e) { console.error('Email failed:', e) }
    return
  }

  // Get active game
  const { data: games } = await supabase
    .from('games')
    .select('id, turn_number')
    .order('created_at', { ascending: false })
    .limit(1)

  if (!games || games.length === 0) {
    console.error('No active game found')
    return
  }
  const game = games[0]

  // Find starting location
  const { data: allLocations } = await supabase
    .from('locations')
    .select('id, loc_code, resources, geographic_name, economics')

  let eligible: any[] = []

  if (starting_zone === 'imperial') {
    eligible = allLocations?.filter((l: any) => l.loc_code === 'L0001') ?? []
  } else if (starting_zone === 'borders') {
    eligible = allLocations?.filter((l: any) =>
      (l.resources?.is_imperial_land === true || l.resources?.is_imperial_land === 'true') &&
      l.resources?.population_center &&
      l.loc_code !== 'L0001'
    ) ?? []
  } else {
    eligible = allLocations?.filter((l: any) =>
      !(l.resources?.is_imperial_land === true || l.resources?.is_imperial_land === 'true') &&
      l.resources?.population_center &&
      ['city', 'town'].includes(l.resources.population_center.type)
    ) ?? []
  }

  if (eligible.length === 0) {
    console.error('No starting location available for zone:', starting_zone)
    return
  }

  const startingLocation = eligible[Math.floor(Math.random() * eligible.length)]

  // Hash password
  const password_hash = await bcrypt.hash(password, 10)

  // Create player
  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({ email, password_hash, display_name: email.split('@')[0] })
    .select()
    .single()
  if (playerError) {
    console.error('Player creation failed:', playerError)
    return
  }

  // Generate unique faction code
  let faction_code = `F${Math.floor(Math.random() * 9000) + 1000}`
  for (let i = 0; i < 20; i++) {
    const { data: fc } = await supabase
      .from('factions')
      .select('id')
      .eq('faction_code', faction_code)
      .single()
    if (!fc) break
    faction_code = `F${Math.floor(Math.random() * 9000) + 1000}`
  }

  const bonus = starting_zone === 'imperial' ? 1000 : starting_zone === 'borders' ? 500 : 0
  const funds = 5000 + bonus

  // Create faction
  const { data: faction, error: factionError } = await supabase
    .from('factions')
    .insert({
      game_id: game.id,
      player_id: player.id,
      faction_code,
      name: `Faction ${faction_code}`,
      faction_type: 'player',
      is_npc: false,
      funds,
      control_points_max: 200,
      status: 'active',
      joined_turn: game.turn_number,
      stances: { default: 'neutral', specific: { F001: 'friendly', F002: 'friendly', F003: 'enemy', F004: 'enemy', F005: 'friendly' } },
      attributes: { leader_type, element: element || null, starting_zone },
      starting_location: startingLocation.loc_code,
    })
    .select()
    .single()
  if (factionError) {
    console.error('Faction creation failed:', factionError)
    return
  }

  // Starting skills
  const skillMap: Record<string, { tag: string; level: number }[]> = {
    general: [{ tag: 'cmbt', level: 1 }, { tag: 'blde', level: 1 }],
    mage: [{ tag: 'mage', level: 1 }, { tag: element === 'fire' ? 'fire' : element === 'water' ? 'watr' : element === 'earth' ? 'eart' : element === 'air' ? 'air_' : 'void', level: 1 }],
    adventurer: [{ tag: 'scou', level: 1 }],
    craftsman: [{ tag: 'lumb', level: 1 }, { tag: 'digg', level: 1 }],
  }
  const heroSkills = skillMap[leader_type] ?? [{ tag: 'cmbt', level: 1 }]

  const itemMap: Record<string, { tag: string; quantity: number; equipped: boolean; equip_slot?: string }[]> = {
    general: [
      { tag: 'swrd', quantity: 1, equipped: true, equip_slot: 'weapon' },
      { tag: 'leat', quantity: 1, equipped: true, equip_slot: 'armor' },
      { tag: 'hrse', quantity: 1, equipped: true, equip_slot: 'mount' },
    ],
    mage: [{ tag: 'hrse', quantity: 1, equipped: true, equip_slot: 'mount' }],
    adventurer: [
      { tag: 'hrse', quantity: 1, equipped: true, equip_slot: 'mount' },
      { tag: 'food', quantity: 30, equipped: false },
    ],
    craftsman: [
      { tag: 'tool', quantity: 2, equipped: false },
      { tag: 'hrse', quantity: 1, equipped: true, equip_slot: 'mount' },
    ],
  }
  const heroItems = itemMap[leader_type] ?? []

  // Create hero
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
  if (heroError) {
    console.error('Hero creation failed:', heroError)
    return
  }

  if (heroSkills.length > 0) {
    await supabase.from('unit_skills').insert(
      heroSkills.map(s => ({ unit_id: hero.id, skill_tag: s.tag, level: s.level, experience_days: 0, token_progress: 0 }))
    )
  }
  if (heroItems.length > 0) {
    await supabase.from('unit_items').insert(
      heroItems.map(i => ({ unit_id: hero.id, item_tag: i.tag, quantity: i.quantity, equipped: i.equipped, equip_slot: i.equip_slot ?? null, token_progress: 0 }))
    )
  }

  // Create followers
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

  console.log(`Player created: ${email}, faction: ${faction_code}, location: ${startingLocation.loc_code}`)

  const settlementName = startingLocation.resources?.population_center?.name ?? startingLocation.loc_code
  const regionName = startingLocation.geographic_name ?? ''

  try {
    await sendEmail({
      to: email,
      subject: `Welcome to New Overlord — ${faction_code}`,
      text: `Welcome to New Overlord!

Your faction has been created:

Faction Code: ${faction_code}
Starting Location: ${settlementName} [${startingLocation.loc_code}], ${regionName}
Starting Funds: $${funds.toLocaleString()}
Leader Type: ${leader_type.charAt(0).toUpperCase() + leader_type.slice(1)}
${element ? `Element: ${element.charAt(0).toUpperCase() + element.slice(1)}\n` : ''}
Your units:
  Hero [${heroCode}] — your starting leader
  Followers [${followersCode}] — 50 unskilled followers

Use these orders on your first turn to name them:
  NAME FACTION "${faction_code}" "Your Faction Name"
  NAME UNIT ${heroCode} "Your Hero Name"

Your first turn report will arrive when the game begins.

Good luck!
— The Game Master`
    })
  } catch (emailErr) {
    console.error('Welcome email failed (player still created):', emailErr)
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()

    if (payload.type !== 'email.received') {
      return NextResponse.json({ ok: true })
    }

    const emailData = payload.data
    const from = emailData.from
    const to = emailData.to?.[0] ?? emailData.received_for?.[0] ?? ''
    const subject = (emailData.subject ?? '').toLowerCase()
    const emailId = emailData.email_id

    // Fetch full email content from Resend API
    const resendRes = await fetch(`https://api.resend.com/emails/received/${emailId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      }
    })
    const fullEmail = await resendRes.json()
    const body = fullEmail.text ?? fullEmail.html ?? ''

    console.log('Full email response:', JSON.stringify(fullEmail))
    console.log('Email body:', body)

    const toAddress = to.toLowerCase()
    const firstLine = body.split('\n')[0]?.trim().toUpperCase() ?? ''

    if (toAddress.includes('register') || firstLine === 'REGISTER' || subject.includes('register')) {
      await handleRegistration(from, body)
    } else if (toAddress.includes('orders') || firstLine === 'ORDERS') {
      try {
        await sendEmail({
          to: from,
          subject: 'New Overlord — Orders Received',
          text: 'Order processing is not yet active. Please wait for the game to begin.'
        })
      } catch (e) { console.error('Email failed:', e) }
    } else {
      try {
        await sendEmail({
          to: from,
          subject: 'New Overlord — Unknown Command',
          text: `Unknown command. To register send an email to register@adeliivexa.resend.app with:\n\nREGISTER\nPASSWORD yourpassword\nTYPE general|mage|adventurer|craftsman\nZONE imperial|borders|colonial`
        })
      } catch (e) { console.error('Email failed:', e) }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Inbound email error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
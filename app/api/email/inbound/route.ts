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

  const password = data['PASSWORD']
  const leader_type = (data['TYPE'] || 'general').toLowerCase()
  const element = (data['ELEMENT'] || '').toLowerCase()
  const starting_zone = (data['ZONE'] || 'colonial').toLowerCase()

  if (!password) {
    try {
      await sendEmail({
        to: from,
        subject: 'New Overlord — Registration Error',
        text: `Registration failed — PASSWORD is required.\n\nPlease send to orders@new-overlord.us:\n\nREGISTER\nPASSWORD yourpassword\nTYPE general|mage|adventurer|craftsman\nZONE imperial|borders|colonial\nELEMENT fire|water|earth|air|void (mages only)`
      })
    } catch (e) { console.error('Email failed:', e) }
    return
  }

  if (leader_type === 'mage' && !element) {
    try {
      await sendEmail({
        to: from,
        subject: 'New Overlord — Registration Error',
        text: `Mages must choose an element.\n\nAdd: ELEMENT fire|water|earth|air|void`
      })
    } catch (e) { console.error('Email failed:', e) }
    return
  }

  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('email', from)
    .single()

  if (existing) {
    try {
      await sendEmail({
        to: from,
        subject: 'New Overlord — Already Registered',
        text: `That email address is already registered. If you have a problem contact orders@new-overlord.us.`
      })
    } catch (e) { console.error('Email failed:', e) }
    return
  }

  const password_hash = await bcrypt.hash(password, 10)

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({
      email: from,
      password_hash,
      display_name: from.split('@')[0],
      status: 'pending',
      attributes: { leader_type, element: element || null, starting_zone },
    })
    .select()
    .single()

  if (playerError) {
    console.error('Player creation failed:', playerError)
    return
  }

  console.log(`Pending registration: ${from}, type: ${leader_type}, zone: ${starting_zone}`)

  try {
    await sendEmail({
      to: from,
      subject: 'New Overlord — Registration Received',
      text: `Your registration has been received!

Please confirm the following details are correct. If anything is wrong, contact the Game Master at orders@new-overlord.us.

  Email: ${from}
  Leader Type: ${leader_type.charAt(0).toUpperCase() + leader_type.slice(1)}
  ${element ? `Element: ${element.charAt(0).toUpperCase() + element.slice(1)}\n  ` : ''}Starting Zone: ${starting_zone.charAt(0).toUpperCase() + starting_zone.slice(1)}

Your first turn report will be sent when the game begins.

— The Game Master`
    })
  } catch (e) { console.error('Confirmation email failed:', e) }
}

async function handleOrders(from: string, body: string) {
  const { parseOrderFile, formatSyntaxCheck } = await import('../../../lib/orderParser')

  const parsed = parseOrderFile(body)

  if (!parsed.factionCode || !parsed.password) {
    await sendEmail({
      to: from,
      subject: 'New Overlord — Order Error',
      text: `Could not parse your order file. Make sure it starts with:\n#GAME FXXXX yourpassword\n\nErrors:\n${parsed.errors.join('\n')}`
    })
    return
  }

  const { data: faction } = await supabase
    .from('factions')
    .select('id, faction_code, name, player_id')
    .eq('faction_code', parsed.factionCode)
    .single()

  if (!faction) {
    await sendEmail({
      to: from,
      subject: 'New Overlord — Order Error',
      text: `Faction ${parsed.factionCode} not found.`
    })
    return
  }

  const { data: player } = await supabase
    .from('players')
    .select('id, email, password_hash')
    .eq('id', faction.player_id)
    .single()

  if (!player || player.email !== from) {
    await sendEmail({
      to: from,
      subject: 'New Overlord — Order Error',
      text: `You are not authorized to submit orders for faction ${parsed.factionCode}.`
    })
    return
  }

  const validPassword = await bcrypt.compare(parsed.password, player.password_hash)
  if (!validPassword) {
    await sendEmail({
      to: from,
      subject: 'New Overlord — Order Error',
      text: `Invalid password for faction ${parsed.factionCode}.`
    })
    return
  }

  const { data: games } = await supabase
    .from('games')
    .select('id, turn_number, status')
    .order('created_at', { ascending: false })
    .limit(1)
  if (!games || games.length === 0) return
  const game = games[0]

  await supabase
    .from('orders')
    .delete()
    .eq('faction_id', faction.id)
    .eq('turn_number', game.turn_number)

  if (parsed.factionOrders.length > 0) {
    await supabase.from('orders').insert({
      faction_id: faction.id,
      unit_id: null,
      turn_number: game.turn_number,
      orders_raw: parsed.factionOrders.map((o: any) => o.raw).join('\n'),
      orders_parsed: parsed.factionOrders,
      submitted_at: new Date().toISOString(),
    })
  }

  for (const unitOrder of parsed.unitOrders) {
    const { data: unit } = await supabase
      .from('units')
      .select('id, unit_code, name')
      .eq('unit_code', unitOrder.unitCode)
      .eq('faction_id', faction.id)
      .single()

    if (!unit) {
      parsed.errors.push(`Unit ${unitOrder.unitCode} not found or not yours`)
      continue
    }

    await supabase.from('orders').insert({
      faction_id: faction.id,
      unit_id: unit.id,
      turn_number: game.turn_number,
      orders_raw: unitOrder.orders.map((o: any) => o.raw).join('\n'),
      orders_parsed: unitOrder.orders,
      submitted_at: new Date().toISOString(),
    })
  }

  const syntaxReport = formatSyntaxCheck(parsed)
  await sendEmail({
    to: from,
    subject: `New Overlord — Orders Received [${parsed.factionCode}] Turn ${game.turn_number}`,
    text: `Your orders for ${faction.name} [${parsed.factionCode}] have been received for Turn ${game.turn_number}.\n\nSyntax Check:\n\n${syntaxReport}\n\n${parsed.errors.length > 0 ? 'Please fix errors and resubmit.' : 'Orders look good!'}\n\n— The Game Master`
  })
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

    const { Resend } = await import('resend')
    const resendClient = new Resend(process.env.RESEND_API_KEY)
    const { data: fullEmail } = await resendClient.emails.receiving.get(emailId)
    const body = fullEmail?.text ?? fullEmail?.html ?? ''

    const firstLine = body.split('\n').map((l: string) => l.trim()).filter(Boolean)[0]?.toUpperCase() ?? ''

    if (firstLine.startsWith('#GAME')) {
      await handleOrders(from, body)
    } else if (firstLine === 'REGISTER' || subject.includes('register')) {
      await handleRegistration(from, body)
    } else {
      try {
        await sendEmail({
          to: from,
          subject: 'New Overlord — Unknown Command',
          text: `Unknown command. 

To register: send an email to orders@new-overlord.us with REGISTER as the first line.
To submit orders: send an email to orders@new-overlord.us starting with #GAME FXXXX yourpassword`
        })
      } catch (e) { console.error('Email failed:', e) }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Inbound email error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
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

    // Fetch full email content using Resend SDK
    const { Resend } = await import('resend')
    const resendClient = new Resend(process.env.RESEND_API_KEY)
    const { data: fullEmail } = await resendClient.emails.receiving.get(emailId)
    const body = fullEmail?.text ?? fullEmail?.html ?? ''

    const toAddress = to.toLowerCase()
    const firstLine = body.split('\n').map((l: string) => l.trim()).filter(Boolean)[0]?.toUpperCase() ?? ''

    if (toAddress.includes('orders') || firstLine === 'REGISTER' || subject.includes('register')) {
      await handleRegistration(from, body)
    } else if (firstLine === 'ORDERS' || subject.includes('orders')) {
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
          text: `Unknown command. To register send an email to orders@new-overlord.us with:\n\nREGISTER\nPASSWORD yourpassword\nTYPE general|mage|adventurer|craftsman\nZONE imperial|borders|colonial`
        })
      } catch (e) { console.error('Email failed:', e) }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Inbound email error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
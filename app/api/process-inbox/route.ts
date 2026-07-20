import { NextRequest, NextResponse } from 'next/server'
import { checkGmailInbox } from '../../lib/gmailPoller'
import { supabase } from '../../lib/supabase'
import { sendEmail } from '../../lib/email'
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
    await sendEmail({
      to: from,
      subject: 'New Overlord — Registration Error',
      text: `Registration failed — PASSWORD is required.\n\nPlease send to orders.newoverlord@gmail.com:\n\nREGISTER\nPASSWORD yourpassword\nTYPE general|mage|adventurer|craftsman\nZONE imperial|borders|colonial\nELEMENT fire|water|earth|air|void (mages only)`
    })
    return 'error: no password'
  }

  if (leader_type === 'mage' && !element) {
    await sendEmail({
      to: from,
      subject: 'New Overlord — Registration Error',
      text: `Mages must choose an element.\n\nAdd: ELEMENT fire|water|earth|air|void`
    })
    return 'error: no element'
  }

  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('email', from)
    .single()

  if (existing) {
    await sendEmail({
      to: from,
      subject: 'New Overlord — Already Registered',
      text: `That email address is already registered.`
    })
    return 'error: already registered'
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

  if (playerError) return `error: ${playerError.message}`

  console.log(`Pending registration: ${from}, type: ${leader_type}, zone: ${starting_zone}`)

  await sendEmail({
    to: from,
    subject: 'New Overlord — Registration Received',
    text: `Your registration has been received!

Details:
  Email: ${from}
  Leader Type: ${leader_type.charAt(0).toUpperCase() + leader_type.slice(1)}
  ${element ? `Element: ${element.charAt(0).toUpperCase() + element.slice(1)}\n  ` : ''}Starting Zone: ${starting_zone.charAt(0).toUpperCase() + starting_zone.slice(1)}

Your faction will be created when the next turn processes. You will receive your full welcome email with your faction code and starting location at that time.

— The Game Master`
  })

  return `pending: ${from}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')

  if (secret !== process.env.INBOX_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const emails = await checkGmailInbox()
    const results = []

    for (const email of emails) {
      const firstLine = email.body.split('\n').map(l => l.trim()).filter(Boolean)[0]?.toUpperCase() ?? ''
      const subject = email.subject.toLowerCase()

      console.log('Email from:', email.from)
      console.log('Subject:', email.subject)
      console.log('First line:', firstLine)
      console.log('Body:', email.body.substring(0, 200))

      if (firstLine === 'REGISTER' || subject.includes('register')) {
        const result = await handleRegistration(email.from, email.body)
        results.push({ from: email.from, action: 'register', result })
      } else if (firstLine === 'ORDERS' || subject.includes('orders')) {
        results.push({ from: email.from, action: 'orders', result: 'pending' })
      } else {
        results.push({ from: email.from, action: 'unknown', result: 'ignored' })
      }
    }

    return NextResponse.json({ processed: results.length, results })
  } catch (err: any) {
    console.error('Inbox processing error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
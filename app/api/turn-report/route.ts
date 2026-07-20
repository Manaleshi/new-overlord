import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../lib/supabase'
import { generateTurnReport } from '../../lib/turnReport'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  const factionCode = searchParams.get('faction')

  if (secret !== process.env.INBOX_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get faction by code
    const { data: faction } = await supabase
      .from('factions')
      .select('id, faction_code, name')
      .eq('faction_code', factionCode ?? 'F001')
      .single()

    if (!faction) {
      return NextResponse.json({ error: 'Faction not found' }, { status: 404 })
    }

    const report = await generateTurnReport(faction.id)

    return new NextResponse(report, {
      headers: { 'Content-Type': 'text/plain' }
    })
  } catch (err: any) {
    console.error('Turn report error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
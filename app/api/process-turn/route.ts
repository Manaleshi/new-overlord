import { NextRequest, NextResponse } from 'next/server'
import { processTurn } from '../../lib/turnProcessor'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  const gameId = searchParams.get('game')

  if (secret !== process.env.INBOX_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!gameId) {
    return NextResponse.json({ error: 'Missing game id — pass ?game=<uuid>' }, { status: 400 })
  }

  try {
    const result = await processTurn(gameId)

    return NextResponse.json({
      ok: true,
      turnProcessed: result.turnNumber,
      newTurnNumber: result.turnNumber + 1,
      registrations: result.registrations,
      eventCount: result.eventCount,
      reportsSent: result.reportsSent,
      reportErrors: result.reportErrors,
    })
  } catch (err: any) {
    console.error('Process turn error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readTickets } from '@/lib/cs-storage'
import { readDummyTickets } from '@/lib/dummy-data'
import { hasMSAuth } from '@/lib/ms-graph'

export async function GET(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const tickets = readTickets()
  if (req.nextUrl.searchParams.get('dummy') === '1') {
    tickets.push(...readDummyTickets())
  }
  return NextResponse.json({ tickets, msConnected: hasMSAuth() })
}

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readTickets } from '@/lib/cs-storage'
import { hasMSAuth } from '@/lib/ms-graph'

export async function GET() {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json({ tickets: readTickets(), msConnected: hasMSAuth() })
}

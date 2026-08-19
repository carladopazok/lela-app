import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readTickets, writeTickets } from '@/lib/cs-storage'
import { readDummyTickets } from '@/lib/dummy-data'
import { hasMSAuth } from '@/lib/ms-graph'
import { hasIGAuth } from '@/lib/instagram-graph'
import { randomUUID } from 'crypto'
import type { CSTicket, TicketTag } from '@/types'

export async function GET(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const tickets = readTickets()
  if (req.nextUrl.searchParams.get('dummy') === '1') {
    tickets.push(...readDummyTickets())
  }
  return NextResponse.json({ tickets, msConnected: hasMSAuth(), igConnected: hasIGAuth() })
}

// Creates a ticket not backed by a real inbound Outlook message (messageId: ''). The reply
// route falls back to sendNewEmail for these instead of Graph's reply-to-message API.
export async function POST(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { subject, from, fromName, tags } = await req.json() as {
    subject: string; from: string; fromName: string; tags?: TicketTag[]
  }
  if (!subject?.trim() || !from?.trim()) {
    return NextResponse.json({ error: 'subject and from are required' }, { status: 400 })
  }

  const ticket: CSTicket = {
    id: randomUUID(),
    channel: 'email',
    subject: subject.trim(),
    from: from.trim(),
    fromName: fromName?.trim() || from.trim(),
    receivedAt: new Date().toISOString(),
    messageId: '',
    status: 'open',
    tags: tags ?? [],
    thread: [],
  }

  const tickets = readTickets()
  tickets.push(ticket)
  writeTickets(tickets)

  return NextResponse.json({ ticket })
}

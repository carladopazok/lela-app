import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readTickets, writeTickets } from '@/lib/cs-storage'
import { deleteMessage } from '@/lib/ms-graph'
import type { TicketStatus, TicketTag } from '@/types'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json() as { status?: TicketStatus; tags?: TicketTag[] }
  const tickets = readTickets()
  const idx = tickets.findIndex((t) => t.id === params.id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.status !== undefined) tickets[idx].status = body.status
  if (body.tags !== undefined) tickets[idx].tags = body.tags

  writeTickets(tickets)
  return NextResponse.json({ ticket: tickets[idx] })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const all = readTickets()
  const ticket = all.find((t) => t.id === params.id)

  // Best-effort: delete from Outlook (moves to Deleted Items). Don't block local delete if it fails.
  // Instagram's Graph API has no equivalent delete endpoint, so those tickets are local-only.
  if (ticket?.channel !== 'instagram' && ticket?.messageId) {
    try { await deleteMessage(ticket.messageId) } catch { /* ignore */ }
  }

  writeTickets(all.filter((t) => t.id !== params.id))
  return NextResponse.json({ ok: true })
}

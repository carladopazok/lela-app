import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readTickets, writeTickets } from '@/lib/cs-storage'
import { replyToMessage, sendNewEmail } from '@/lib/ms-graph'
import { sendMessage as sendIGMessage } from '@/lib/instagram-graph'
import { randomUUID } from 'crypto'
import type { CSMessage } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { body, isNote } = await req.json() as { body: string; isNote?: boolean }
  if (!body?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const tickets = readTickets()
  const idx = tickets.findIndex((t) => t.id === params.id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Instagram: real IG message id (both directions), so a resync can dedup against this reply
  // instead of re-adding it as a spurious inbound message. Email/note: randomUUID() as before.
  let messageId: string = randomUUID()
  let fromLabel = process.env.OUTLOOK_EMAIL ?? 'me'

  if (!isNote) {
    try {
      if (tickets[idx].channel === 'instagram') {
        const sent = await sendIGMessage(tickets[idx].from, body)
        messageId = sent.message_id
        fromLabel = 'Instagram'
      } else if (tickets[idx].messageId) {
        // Tickets created manually (not synced from a real inbound email) have no Outlook
        // message to reply to — send a fresh email instead.
        await replyToMessage(tickets[idx].messageId, body)
      } else {
        await sendNewEmail(tickets[idx].from, tickets[idx].subject, body)
      }
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Send failed' }, { status: 500 })
    }
  }

  const message: CSMessage = {
    id: messageId,
    direction: isNote ? 'note' : 'outbound',
    body,
    from: isNote ? (process.env.OUTLOOK_EMAIL ?? 'me') : fromLabel,
    sentAt: new Date().toISOString(),
  }

  tickets[idx].thread.push(message)
  writeTickets(tickets)

  return NextResponse.json({ ticket: tickets[idx] })
}

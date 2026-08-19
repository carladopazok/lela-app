import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fetchInboxMessages } from '@/lib/ms-graph'
import { readTickets, writeTickets } from '@/lib/cs-storage'
import type { CSTicket, CSMessage } from '@/types'
import { randomUUID } from 'crypto'

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export async function POST() {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const [messages, existing] = await Promise.all([
      fetchInboxMessages(50),
      Promise.resolve(readTickets()),
    ])

    const existingIds = new Set(existing.map((t) => t.messageId))
    let newCount = 0

    for (const msg of messages) {
      if (existingIds.has(msg.id)) continue

      const replyTo = msg.replyTo?.[0]?.emailAddress
      const fromAddr = replyTo?.address ?? msg.from.emailAddress.address
      const fromName = replyTo?.name ?? msg.from.emailAddress.name

      const body = msg.body.contentType === 'html' ? stripHtml(msg.body.content) : msg.body.content

      const inbound: CSMessage = {
        id: randomUUID(),
        direction: 'inbound',
        body,
        from: fromAddr,
        sentAt: msg.receivedDateTime,
      }

      const ticket: CSTicket = {
        id: randomUUID(),
        channel: 'email',
        subject: msg.subject ?? '(no subject)',
        from: fromAddr,
        fromName,
        receivedAt: msg.receivedDateTime,
        messageId: msg.id,
        status: 'open',
        tags: [],
        thread: [inbound],
      }

      existing.push(ticket)
      newCount++
    }

    writeTickets(existing)
    return NextResponse.json({ synced: newCount })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 })
  }
}

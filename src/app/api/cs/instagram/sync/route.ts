import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fetchConversations, fetchConversationMessages, getIgUserId } from '@/lib/instagram-graph'
import { readTickets, writeTickets } from '@/lib/cs-storage'
import type { CSMessage } from '@/types'
import { randomUUID } from 'crypto'

// Unlike the Outlook sync (one new message = one new ticket), Instagram DMs are conversations —
// this is one-ticket-per-conversation, merging any new messages into the existing thread on
// repeat syncs. Message ids are the real Instagram message ids (not randomUUID()) so a resync
// can dedup against messages already recorded, including our own prior replies.
export async function POST() {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const [conversations, igUserId, tickets] = await Promise.all([
      fetchConversations(50),
      getIgUserId(),
      Promise.resolve(readTickets()),
    ])

    const byConversationId = new Map(
      tickets.filter((t) => t.channel === 'instagram').map((t) => [t.messageId, t] as const)
    )

    let touchedCount = 0

    for (const conv of conversations) {
      const messages = await fetchConversationMessages(conv.id)
      if (messages.length === 0) continue

      const sorted = [...messages].sort(
        (a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime()
      )

      const customerParticipant = conv.participants?.data.find((p) => p.id !== igUserId)
      const customerId = customerParticipant?.id ?? sorted.find((m) => m.from.id !== igUserId)?.from.id ?? conv.id
      const customerName = customerParticipant?.username ?? customerId

      let ticket = byConversationId.get(conv.id)

      if (!ticket) {
        const firstInbound = sorted.find((m) => m.from.id !== igUserId)
        const subject = firstInbound?.message
          ? firstInbound.message.slice(0, 60) + (firstInbound.message.length > 60 ? '…' : '')
          : 'Instagram DM'

        ticket = {
          id: randomUUID(),
          channel: 'instagram',
          subject,
          from: customerId,
          fromName: customerName,
          receivedAt: sorted[0].created_time,
          messageId: conv.id,
          status: 'open',
          tags: [],
          thread: [],
        }
        tickets.push(ticket)
        byConversationId.set(conv.id, ticket)
      }

      const existingIds = new Set(ticket.thread.map((m) => m.id))
      let addedAny = false
      for (const m of sorted) {
        if (existingIds.has(m.id)) continue
        const isFromUs = m.from.id === igUserId
        const cs: CSMessage = {
          id: m.id,
          direction: isFromUs ? 'outbound' : 'inbound',
          body: m.message ?? '',
          from: isFromUs ? (m.from.username ?? 'Instagram') : customerId,
          sentAt: m.created_time,
        }
        ticket.thread.push(cs)
        existingIds.add(m.id)
        addedAny = true
      }
      ticket.thread.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())

      if (addedAny) touchedCount++
    }

    writeTickets(tickets)
    return NextResponse.json({ synced: touchedCount })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 })
  }
}

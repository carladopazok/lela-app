import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readTickets, readMacros, readCustomTags, readHiddenTags, readAgentGuidance } from '@/lib/cs-storage'
import { draftTicketReply, type AiDraftCustomerContext } from '@/lib/ollama'
import { TICKET_TAGS } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { customer, guidance } = await req.json() as {
    customer?: AiDraftCustomerContext | null
    guidance?: string
  }

  const tickets = readTickets()
  const ticket = tickets.find((t) => t.id === params.id)
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const hidden = readHiddenTags()
  const availableTags = [
    ...(TICKET_TAGS as readonly string[]).filter((t) => !hidden.includes(t)),
    ...readCustomTags(),
  ]

  try {
    const result = await draftTicketReply({
      subject: ticket.subject,
      thread: ticket.thread,
      availableTags,
      macros: readMacros(),
      customer,
      agentGuidance: readAgentGuidance(),
      guidance,
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI draft failed' }, { status: 500 })
  }
}

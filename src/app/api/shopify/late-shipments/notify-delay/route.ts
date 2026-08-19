import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readTickets, writeTickets, readMacros } from '@/lib/cs-storage'
import { randomUUID } from 'crypto'
import type { CSTicket } from '@/types'

const MACRO_NAME = 'Shipping Delay — Apology'

function fillTemplate(body: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    body
  )
}

export async function POST(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { orderName, customerEmail, customerName } = await req.json() as {
    orderName: string
    customerEmail: string
    customerName: string
  }
  if (!orderName?.trim() || !customerEmail?.trim()) {
    return NextResponse.json({ error: 'orderName and customerEmail are required' }, { status: 400 })
  }

  const macro = readMacros().find((m) => m.name === MACRO_NAME)
  const template = macro?.body ??
    "Hi {{customerName}},\n\nYour order {{orderName}} is experiencing a short shipping delay, but it's on its way and will be sent out soon."

  const draftBody = fillTemplate(template, { customerName: customerName || 'there', orderName })

  const ticket: CSTicket = {
    id: randomUUID(),
    channel: 'email',
    subject: `Order ${orderName} — Shipping Delay`,
    from: customerEmail,
    fromName: customerName || customerEmail,
    receivedAt: new Date().toISOString(),
    messageId: '',
    status: 'open',
    tags: ['shipping'],
    thread: [],
    relatedOrderName: orderName,
  }

  const tickets = readTickets()
  tickets.push(ticket)
  writeTickets(tickets)

  return NextResponse.json({ ticket, draftBody })
}

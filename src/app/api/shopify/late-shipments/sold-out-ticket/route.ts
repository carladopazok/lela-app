import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readTickets, writeTickets, readMacros } from '@/lib/cs-storage'
import { randomUUID } from 'crypto'
import type { CSTicket } from '@/types'

const MACRO_NAME = 'Sold Out — Offer Alternatives'

function fillTemplate(body: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    body
  )
}

export async function POST(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { orderName, customerEmail, customerName, items } = await req.json() as {
    orderName: string
    customerEmail: string
    customerName: string
    items: Array<{ title: string; relatedProductTitles: string[] }>
  }
  if (!orderName?.trim() || !customerEmail?.trim() || !items?.length) {
    return NextResponse.json({ error: 'orderName, customerEmail and items are required' }, { status: 400 })
  }

  const macro = readMacros().find((m) => m.name === MACRO_NAME)
  const template = macro?.body ??
    "Hi {{customerName}},\n\nUnfortunately {{productList}} from your order {{orderName}} is currently sold out.\n\nYou might like:\n{{relatedProducts}}"

  const productList = items.map((i) => i.title).join(', ')
  const relatedTitles = Array.from(new Set(items.flatMap((i) => i.relatedProductTitles)))
  const relatedProducts = relatedTitles.length > 0
    ? relatedTitles.map((t) => `- ${t}`).join('\n')
    : '(No close alternatives found in the catalog — consider suggesting something manually.)'

  const draftBody = fillTemplate(template, {
    customerName: customerName || 'there',
    orderName,
    productList,
    relatedProducts,
  })

  const ticket: CSTicket = {
    id: randomUUID(),
    subject: `Order ${orderName} — Sold Out`,
    from: customerEmail,
    fromName: customerName || customerEmail,
    receivedAt: new Date().toISOString(),
    messageId: '',
    status: 'open',
    tags: ['order issue'],
    thread: [],
    relatedOrderName: orderName,
  }

  const tickets = readTickets()
  tickets.push(ticket)
  writeTickets(tickets)

  return NextResponse.json({ ticket, draftBody })
}

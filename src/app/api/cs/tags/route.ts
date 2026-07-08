import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readCustomTags, writeCustomTags, readHiddenTags, writeHiddenTags, readTickets, writeTickets } from '@/lib/cs-storage'
import { TICKET_TAGS } from '@/types'

export async function GET() {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json({ tags: readCustomTags(), hidden: readHiddenTags() })
}

export async function POST(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { name } = await req.json() as { name: string }
  const tag = name?.trim().toLowerCase()
  if (!tag) return NextResponse.json({ error: 'Tag name required' }, { status: 400 })
  const existing = readCustomTags()
  if (!existing.includes(tag)) writeCustomTags([...existing, tag])
  return NextResponse.json({ tag })
}

export async function DELETE(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { name } = await req.json() as { name: string }
  const tag = name?.trim().toLowerCase()
  if (!tag) return NextResponse.json({ error: 'Tag name required' }, { status: 400 })

  const isPredefined = (TICKET_TAGS as readonly string[]).includes(tag)
  if (isPredefined) {
    const hidden = readHiddenTags()
    if (!hidden.includes(tag)) writeHiddenTags([...hidden, tag])
  } else {
    writeCustomTags(readCustomTags().filter((t) => t !== tag))
  }

  const tickets = readTickets()
  writeTickets(tickets.map((t) => ({ ...t, tags: t.tags.filter((tg) => tg !== tag) })))
  return NextResponse.json({ ok: true })
}

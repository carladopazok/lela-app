import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readMacros, writeMacros } from '@/lib/cs-storage'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { name, body } = await req.json() as { name: string; body: string }
  const macros = readMacros()
  const idx = macros.findIndex((m) => m.id === params.id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  macros[idx] = { ...macros[idx], name: name.trim(), body: body.trim(), updatedAt: new Date().toISOString() }
  writeMacros(macros)
  return NextResponse.json({ macro: macros[idx] })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  writeMacros(readMacros().filter((m) => m.id !== params.id))
  return NextResponse.json({ ok: true })
}

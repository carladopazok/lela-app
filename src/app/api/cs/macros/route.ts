import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readMacros, writeMacros } from '@/lib/cs-storage'
import { randomUUID } from 'crypto'
import type { CSMacro } from '@/types'

export async function GET() {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json({ macros: readMacros() })
}

export async function POST(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { name, body } = await req.json() as { name: string; body: string }
  if (!name?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Name and body are required' }, { status: 400 })
  }

  const macros = readMacros()
  const macro: CSMacro = { id: randomUUID(), name: name.trim(), body: body.trim(), createdAt: new Date().toISOString() }
  macros.push(macro)
  writeMacros(macros)
  return NextResponse.json({ macro })
}

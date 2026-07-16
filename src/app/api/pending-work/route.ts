import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readDoneIds, writeDoneIds } from '@/lib/pending-work-storage'

export async function GET() {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json({ doneIds: readDoneIds() })
}

export async function PUT(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id, done } = (await req.json()) as { id: string; done: boolean }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = readDoneIds()
  const next = done ? [...new Set([...existing, id])] : existing.filter((x) => x !== id)
  writeDoneIds(next)

  return NextResponse.json({ doneIds: next })
}

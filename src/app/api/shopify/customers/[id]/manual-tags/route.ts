import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readManualTags, writeManualTags } from '@/lib/customer-tags-storage'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const all = readManualTags()
  return NextResponse.json({ manualTags: all[params.id] ?? [] })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { manualTags } = await req.json() as { manualTags: string[] }
  const all = readManualTags()
  if (manualTags.length === 0) {
    delete all[params.id]
  } else {
    all[params.id] = manualTags
  }
  writeManualTags(all)
  return NextResponse.json({ manualTags: manualTags })
}

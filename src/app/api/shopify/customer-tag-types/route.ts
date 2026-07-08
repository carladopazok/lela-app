import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readCustomerTagTypes, writeCustomerTagTypes } from '@/lib/customer-tags-storage'

export async function GET() {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json({ types: readCustomerTagTypes() })
}

export async function POST(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { name } = await req.json() as { name: string }
  const type = name?.trim().toLowerCase()
  if (!type) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const existing = readCustomerTagTypes()
  if (!existing.includes(type)) writeCustomerTagTypes([...existing, type])
  return NextResponse.json({ type })
}

export async function DELETE(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { name } = await req.json() as { name: string }
  const type = name?.trim().toLowerCase()
  if (!type) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  writeCustomerTagTypes(readCustomerTagTypes().filter((t) => t !== type))
  return NextResponse.json({ ok: true })
}

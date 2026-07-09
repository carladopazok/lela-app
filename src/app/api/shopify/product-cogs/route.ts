import { NextRequest, NextResponse } from 'next/server'
import { readProductCogs, writeProductCogs } from '@/lib/product-cogs-storage'

export async function GET() {
  return NextResponse.json({ cogs: readProductCogs() })
}

// Set a product's manual cost: { title, cost }
export async function POST(req: NextRequest) {
  const { title, cost } = await req.json()
  const parsedCost = typeof cost === 'number' ? cost : parseFloat(cost)
  if (!title || !Number.isFinite(parsedCost) || parsedCost < 0) {
    return NextResponse.json({ error: 'title and a non-negative cost are required' }, { status: 400 })
  }
  const data = readProductCogs()
  data[title] = parsedCost
  writeProductCogs(data)
  return NextResponse.json({ cogs: data })
}

// Remove a product's manual cost: { title }
export async function DELETE(req: NextRequest) {
  const { title } = await req.json()
  const data = readProductCogs()
  delete data[title]
  writeProductCogs(data)
  return NextResponse.json({ cogs: data })
}

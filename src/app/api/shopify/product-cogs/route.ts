import { NextRequest, NextResponse } from 'next/server'
import { readProductCogs, writeProductCogs } from '@/lib/product-cogs-storage'

export async function GET() {
  return NextResponse.json({ cogs: readProductCogs() })
}

// Set a product's manual cost: { productId, sku, cost }
export async function POST(req: NextRequest) {
  const { productId, sku, cost } = await req.json()
  const parsedCost = typeof cost === 'number' ? cost : parseFloat(cost)
  if (!productId || !Number.isFinite(parsedCost) || parsedCost < 0) {
    return NextResponse.json({ error: 'productId and a non-negative cost are required' }, { status: 400 })
  }
  const data = readProductCogs()
  data[String(productId)] = { sku: sku ?? '', manualCogs: parsedCost }
  writeProductCogs(data)
  return NextResponse.json({ cogs: data })
}

// Remove a product's manual cost: { productId }
export async function DELETE(req: NextRequest) {
  const { productId } = await req.json()
  const data = readProductCogs()
  delete data[String(productId)]
  writeProductCogs(data)
  return NextResponse.json({ cogs: data })
}

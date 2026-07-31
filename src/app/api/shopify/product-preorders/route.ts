import { NextRequest, NextResponse } from 'next/server'
import { readPreorders, writePreorders } from '@/lib/product-preorders-storage'

export async function GET() {
  return NextResponse.json({ preorders: readPreorders() })
}

// Save/update a pre-order note as a draft — local only, never touches Shopify. Publishing is a
// separate call (PUT /api/shopify/products/[id]/preorder) since that one writes the metafield.
export async function POST(req: NextRequest) {
  const { productId, text } = await req.json()
  if (!productId || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'productId and non-empty text are required' }, { status: 400 })
  }
  const data = readPreorders()
  data[String(productId)] = { text: text.trim(), status: 'draft', updatedAt: new Date().toISOString() }
  writePreorders(data)
  return NextResponse.json({ preorders: data })
}

// Delete a draft entirely: { productId }. Only meant for drafts — a published note has a
// Shopify-side metafield to clear too, which goes through the [id]/preorder DELETE route instead.
export async function DELETE(req: NextRequest) {
  const { productId } = await req.json()
  const data = readPreorders()
  delete data[String(productId)]
  writePreorders(data)
  return NextResponse.json({ preorders: data })
}

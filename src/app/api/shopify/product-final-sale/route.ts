import { NextRequest, NextResponse } from 'next/server'
import { readFinalSale, writeFinalSale } from '@/lib/product-final-sale-storage'

export async function GET() {
  return NextResponse.json({ finalSale: readFinalSale() })
}

// Save/update a final-sale note as a draft — local only, never touches Shopify. Publishing is a
// separate call (PUT /api/shopify/products/[id]/final-sale) since that one writes the metafield.
export async function POST(req: NextRequest) {
  const { productId, text } = await req.json()
  if (!productId || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'productId and non-empty text are required' }, { status: 400 })
  }
  const data = readFinalSale()
  data[String(productId)] = { text: text.trim(), status: 'draft', updatedAt: new Date().toISOString() }
  writeFinalSale(data)
  return NextResponse.json({ finalSale: data })
}

// Delete a draft entirely: { productId }. Only meant for drafts — a published note has a
// Shopify-side metafield to clear too, which goes through the [id]/final-sale DELETE route instead.
export async function DELETE(req: NextRequest) {
  const { productId } = await req.json()
  const data = readFinalSale()
  delete data[String(productId)]
  writeFinalSale(data)
  return NextResponse.json({ finalSale: data })
}

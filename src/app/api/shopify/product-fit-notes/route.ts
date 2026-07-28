import { NextRequest, NextResponse } from 'next/server'
import { readFitNotes, writeFitNotes } from '@/lib/product-fit-notes-storage'

export async function GET() {
  return NextResponse.json({ fitNotes: readFitNotes() })
}

// Save/update a fit note as a draft — local only, never touches Shopify. Publishing is a
// separate call (PUT /api/shopify/products/[id]/fit-note) since that one writes the metafield.
export async function POST(req: NextRequest) {
  const { productId, text } = await req.json()
  if (!productId || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'productId and non-empty text are required' }, { status: 400 })
  }
  const data = readFitNotes()
  data[String(productId)] = { text: text.trim(), status: 'draft', updatedAt: new Date().toISOString() }
  writeFitNotes(data)
  return NextResponse.json({ fitNotes: data })
}

// Delete a draft entirely: { productId }. Only meant for drafts — a published note has a
// Shopify-side metafield to clear too, which goes through the [id]/fit-note DELETE route instead.
export async function DELETE(req: NextRequest) {
  const { productId } = await req.json()
  const data = readFitNotes()
  delete data[String(productId)]
  writeFitNotes(data)
  return NextResponse.json({ fitNotes: data })
}

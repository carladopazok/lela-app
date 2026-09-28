import { NextRequest, NextResponse } from 'next/server'
import { readProductDiscountDrafts, writeProductDiscountDrafts } from '@/lib/product-discount-drafts-storage'

export async function GET() {
  return NextResponse.json({ drafts: readProductDiscountDrafts() })
}

// Replaces the whole saved set in one write — the spreadsheet tab's "Save" button always
// sends its full current state, there's no per-row partial-update endpoint.
export async function PUT(req: NextRequest) {
  const { drafts } = await req.json()
  if (typeof drafts !== 'object' || drafts === null || Array.isArray(drafts)) {
    return NextResponse.json({ error: 'drafts must be an object' }, { status: 400 })
  }
  for (const value of Object.values(drafts)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 95) {
      return NextResponse.json({ error: 'each discount value must be a number between 0 and 95' }, { status: 400 })
    }
  }
  writeProductDiscountDrafts(drafts)
  return NextResponse.json({ drafts })
}

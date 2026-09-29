import { NextRequest, NextResponse } from 'next/server'
import { readProductMarginFloors, writeProductMarginFloors } from '@/lib/product-margin-floors-storage'
import { DEFAULT_MARGIN_FLOOR_PCT, type MarginFloors } from '@/lib/margin-floor'

export async function GET() {
  return NextResponse.json({ floors: readProductMarginFloors(), defaultFloor: DEFAULT_MARGIN_FLOOR_PCT })
}

// Replaces the whole saved set in one write (the spreadsheet's "Save" sends its full state).
// Entries equal to the default are dropped, so the file only holds real per-product overrides.
export async function PUT(req: NextRequest) {
  const { floors } = await req.json()
  if (typeof floors !== 'object' || floors === null || Array.isArray(floors)) {
    return NextResponse.json({ error: 'floors must be an object' }, { status: 400 })
  }
  const clean: MarginFloors = {}
  for (const [productId, value] of Object.entries(floors)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 100) {
      return NextResponse.json({ error: `minimum margin for ${productId} must be a number from 0 to 99` }, { status: 400 })
    }
    if (value !== DEFAULT_MARGIN_FLOOR_PCT) clean[productId] = value
  }
  writeProductMarginFloors(clean)
  return NextResponse.json({ floors: clean })
}

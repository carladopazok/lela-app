import { NextRequest, NextResponse } from 'next/server'
import { readProductCostBreakdown, writeProductCostBreakdown } from '@/lib/product-cost-breakdown-storage'
import { COST_COMPONENT_KEYS, type CostBreakdownEntry } from '@/lib/cost-breakdown'

export async function GET() {
  return NextResponse.json({ breakdown: readProductCostBreakdown() })
}

// Replaces the whole saved set in one write — the Cost Breakdown tab's "Save" button always
// sends its full current state. Products with no filled components are dropped.
export async function PUT(req: NextRequest) {
  const { breakdown } = await req.json()
  if (typeof breakdown !== 'object' || breakdown === null || Array.isArray(breakdown)) {
    return NextResponse.json({ error: 'breakdown must be an object' }, { status: 400 })
  }
  const clean: Record<string, CostBreakdownEntry> = {}
  for (const [productId, entry] of Object.entries(breakdown)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return NextResponse.json({ error: `entry for ${productId} must be an object` }, { status: 400 })
    }
    const out: CostBreakdownEntry = {}
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      if (!(COST_COMPONENT_KEYS as readonly string[]).includes(key)) {
        return NextResponse.json({ error: `unknown cost component "${key}"` }, { status: 400 })
      }
      if (value == null) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return NextResponse.json({ error: `${key} for ${productId} must be a non-negative number` }, { status: 400 })
      }
      out[key as keyof CostBreakdownEntry] = value
    }
    if (Object.keys(out).length > 0) clean[productId] = out
  }
  writeProductCostBreakdown(clean)
  return NextResponse.json({ breakdown: clean })
}

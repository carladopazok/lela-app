import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { markdownProductVariants } from '@/lib/shopify-discounts'

interface RouteParams {
  params: { id: string }
}

// Directly overwrites every variant's live price on Shopify (see markdownProductVariants).
// Writes via write_products (already confirmed granted — see CLAUDE.md), not write_discounts,
// so unlike create-discount this doesn't depend on the pending OAuth reconnect.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { percentage }: { percentage: unknown } = await req.json()
    if (typeof percentage !== 'number' || !(percentage > 0 && percentage <= 0.95)) {
      return NextResponse.json({ error: 'percentage must be a number between 0 (exclusive) and 0.95' }, { status: 400 })
    }

    const shopify = createShopifyClient(session)
    const { variantsUpdated } = await markdownProductVariants(shopify, params.id, percentage)

    return NextResponse.json({ variantsUpdated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

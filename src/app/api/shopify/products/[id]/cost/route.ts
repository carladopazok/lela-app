import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { updateProductCostPerItem } from '@/lib/shopify-cost'
import { readProductCostBreakdown } from '@/lib/product-cost-breakdown-storage'
import { breakdownTotal } from '@/lib/cost-breakdown'

interface RouteParams {
  params: { id: string }
}

// Pushes the product's *saved* Cost Breakdown total into Shopify's "Cost per item" on every
// variant. The total is recomputed here from product-cost-breakdown.json rather than taken
// from the request, so unsaved edits in the Cost Breakdown tab can never reach Shopify.
export async function POST(_req: Request, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const cost = breakdownTotal(readProductCostBreakdown()[params.id])
  if (cost == null) {
    return NextResponse.json({ error: 'No saved cost breakdown for this product — fill in and Save the Cost Breakdown first' }, { status: 400 })
  }

  try {
    const shopify = createShopifyClient(session)
    const { variantsUpdated } = await updateProductCostPerItem(shopify, params.id, cost)
    return NextResponse.json({ cost: Math.round(cost * 100) / 100, variantsUpdated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

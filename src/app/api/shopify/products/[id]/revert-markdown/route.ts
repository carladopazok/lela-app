import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { revertMarkdown } from '@/lib/shopify-discounts'

interface RouteParams {
  params: { id: string }
}

// Undoes a markdown: restores price from compare_at_price and clears it. Writes via
// write_products (already confirmed granted), same as the markdown route it inverts.
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const { variantsReverted } = await revertMarkdown(shopify, params.id)
    return NextResponse.json({ variantsReverted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

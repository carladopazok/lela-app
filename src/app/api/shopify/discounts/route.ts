import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { listActiveDiscounts } from '@/lib/shopify-discount-list'

// Every active discount (code + automatic) with its usage count, for the Discounts tab.
// Requires read_discounts — surfaced as-is if the scope hasn't been granted yet.
export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const discounts = await listActiveDiscounts(createShopifyClient(session))
    return NextResponse.json({ discounts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { getEnrichedCustomers } from '@/lib/customers'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const includeDummy = req.nextUrl.searchParams.get('dummy') === '1'
    const enriched = await getEnrichedCustomers(shopify, includeDummy)
    return NextResponse.json({ customers: enriched })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'No session — go to /install first' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)

    // 1. Verify connection and get shop info + order count in parallel
    const [shopInfo, countAll] = await Promise.all([
      shopify.get<{ shop: { name: string; domain: string; currency: string } }>('/shop.json'),
      shopify.get<{ count: number }>('/orders/count.json', { status: 'any' }),
    ])

    // 2. Check what scopes the token actually has — different base URL (no API version)
    const scopesRes = await fetch(
      `https://${session.shop}/admin/oauth/access_scopes.json`,
      { headers: { 'X-Shopify-Access-Token': session.accessToken } }
    )
    const scopesResult = scopesRes.ok
      ? await scopesRes.json() as { access_scopes: { handle: string }[] }
      : { access_scopes: [] }

    const grantedScopes = scopesResult.access_scopes.map((s) => s.handle)

    // 2. Orders from last 90 days count
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const count90d = await shopify.get<{ count: number }>('/orders/count.json', {
      status: 'any',
      created_at_min: ninetyDaysAgo,
    })

    // 3. Try listing only if read_orders scope is present
    const rawOrders = grantedScopes.includes('read_orders')
      ? await shopify.get<unknown>('/orders.json', { limit: '5', status: 'any' })
      : { skipped: 'read_orders scope not granted' }

    return NextResponse.json({
      session: { shop: session.shop, tokenPrefix: session.accessToken.slice(0, 10) + '…' },
      shopInfo: { name: shopInfo.shop.name, domain: shopInfo.shop.domain, currency: shopInfo.shop.currency },
      grantedScopes,
      totalOrderCount: countAll.count,
      last90dOrderCount: count90d.count,
      rawOrders,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

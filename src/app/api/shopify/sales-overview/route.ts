import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import type { ShopifyOrder, SalesMetrics } from '@/types'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)

    const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')

    // days === -1 means "All Time" — use a very old date to bypass Shopify's implicit ~60-day
    // filter on the orders list endpoint (the count endpoint doesn't have this restriction)
    let createdAtMin: string
    if (days === 0) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      createdAtMin = today.toISOString()
    } else if (days === -1) {
      createdAtMin = '2020-01-01T00:00:00.000Z'
    } else {
      createdAtMin = new Date(Date.now() - days * 86_400_000).toISOString()
    }

    // Fetch shop currency and order count in parallel
    const [shopResult, countResult] = await Promise.all([
      shopify.get<{ shop: { currency: string } }>('/shop.json'),
      shopify.get<{ count: number }>('/orders/count.json', {
        status: 'any',
        created_at_min: createdAtMin,
      }),
    ])

    const currency = shopResult.shop.currency
    console.log(`[sales-overview] days=${days} | created_at_min=${createdAtMin} | count: ${countResult.count} | currency: ${currency}`)

    // Fetch full orders — no fields restriction so nothing is silently dropped
    const orders = await shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
      status: 'any',
      created_at_min: createdAtMin,
    })

    const statusBreakdown = orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.financial_status] = (acc[o.financial_status] ?? 0) + 1
      return acc
    }, {})
    console.log(`[sales-overview] fetched ${orders.length} orders | statuses:`, statusBreakdown)

    // Count all statuses that represent actual money received
    const REVENUE_STATUSES = new Set(['paid', 'partially_paid', 'partially_refunded', 'authorized'])

    let totalRevenue = 0
    let totalRefunds = 0
    let paidOrderCount = 0

    for (const order of orders) {
      const price = parseFloat(order.total_price)

      if (REVENUE_STATUSES.has(order.financial_status)) {
        totalRevenue += price
        paidOrderCount++
      }

      if (order.financial_status === 'refunded' || order.financial_status === 'partially_refunded') {
        const refundTotal = (order.refunds ?? []).reduce((sum, r) => {
          return sum + (r.transactions ?? []).reduce((s, t) => s + parseFloat(t.amount), 0)
        }, 0)
        totalRefunds += refundTotal
      }
    }

    const metrics: SalesMetrics = {
      totalRevenue,
      orderCount: paidOrderCount,
      aov: paidOrderCount > 0 ? totalRevenue / paidOrderCount : 0,
      totalRefunds,
      currency,
      periodDays: days,
    }

    return NextResponse.json(metrics)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sales-overview] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

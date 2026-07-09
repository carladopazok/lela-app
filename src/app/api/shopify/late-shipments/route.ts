import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { readDummyOrders } from '@/lib/dummy-data'
import type { ShopifyOrder, LateShipment } from '@/types'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()

    const orders = await shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
      fulfillment_status: 'unfulfilled',
      status: 'open',
      created_at_max: threeDaysAgo,
      fields: 'id,name,email,created_at,line_items,customer,total_price,fulfillment_status',
    })

    if (req.nextUrl.searchParams.get('dummy') === '1') {
      orders.push(
        ...readDummyOrders().filter((o) => o.fulfillment_status === null && o.created_at <= threeDaysAgo)
      )
    }

    const now = Date.now()

    const shipments: LateShipment[] = orders.map((order) => {
      const createdAt = new Date(order.created_at)
      const daysLate = Math.floor((now - createdAt.getTime()) / 86_400_000)
      const customerName = order.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
        : order.email || 'Unknown'

      return {
        id: order.id,
        orderName: order.name,
        customerName,
        customerEmail: order.customer?.email || order.email || '',
        createdAt: order.created_at,
        daysLate,
        items: order.line_items.map((li) => ({ title: li.title, quantity: li.quantity })),
        totalPrice: order.total_price,
      }
    })

    shipments.sort((a, b) => b.daysLate - a.daysLate)

    return NextResponse.json({ shipments })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

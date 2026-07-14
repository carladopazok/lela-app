import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { readDummyOrders } from '@/lib/dummy-data'
import { readRelatedProducts } from '@/lib/related-products-storage'
import { readTickets } from '@/lib/cs-storage'
import type { ShopifyOrder, ShopifyProduct, LateShipment } from '@/types'

const RELATED_PRODUCTS_LIMIT = 3

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString()

    const orders = await shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
      fulfillment_status: 'unfulfilled',
      status: 'open',
      created_at_max: fiveDaysAgo,
      fields: 'id,name,email,created_at,line_items,customer,total_price,fulfillment_status',
    })

    if (req.nextUrl.searchParams.get('dummy') === '1') {
      orders.push(
        ...readDummyOrders().filter((o) => o.fulfillment_status === null && o.created_at <= fiveDaysAgo)
      )
    }

    // Inventory levels require the read_products scope, which isn't always granted (see
    // CLAUDE.md) — fall back to "unknown" stock status for every item rather than erroring.
    let inventoryAvailable = true
    const productInventoryById = new Map<number, { title: string; qty: number }>()
    // Line item product_id can go stale (product deleted/recreated since the order was placed —
    // common with dummy data harvested from historical orders), so also index by title as a
    // fallback match.
    const productInventoryByTitle = new Map<string, { productId: number; qty: number }>()
    try {
      const shopifyProducts = await shopify.getAll<ShopifyProduct>('/products.json', 'products', {
        fields: 'id,title,variants',
      })
      for (const p of shopifyProducts) {
        const qty = (p.variants ?? []).reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0)
        productInventoryById.set(p.id, { title: p.title, qty })
        productInventoryByTitle.set(p.title, { productId: p.id, qty })
      }
    } catch (err) {
      inventoryAvailable = false
      console.warn('[late-shipments] could not fetch product catalog (likely missing read_products scope), stock status unavailable:', err instanceof Error ? err.message : err)
    }

    const relatedProducts = readRelatedProducts()

    // A late shipment counts as "contacted" once a related ticket actually has an outbound
    // message on it — a sold-out draft that hasn't been sent yet doesn't count.
    const contactedAtByOrder = new Map<string, string>()
    for (const ticket of readTickets()) {
      if (!ticket.relatedOrderName) continue
      const lastOutbound = ticket.thread
        .filter((m) => m.direction === 'outbound')
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0]
      if (!lastOutbound) continue
      const key = `${ticket.relatedOrderName}::${ticket.from.toLowerCase()}`
      const existing = contactedAtByOrder.get(key)
      if (!existing || lastOutbound.sentAt > existing) {
        contactedAtByOrder.set(key, lastOutbound.sentAt)
      }
    }

    const now = Date.now()

    const shipments: LateShipment[] = orders.map((order) => {
      const createdAt = new Date(order.created_at)
      const daysLate = Math.floor((now - createdAt.getTime()) / 86_400_000)
      const customerName = order.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
        : order.email || 'Unknown'

      const items = order.line_items.map((li) => {
        const productId = li.product_id
        let short: boolean | null = null
        let relatedProductTitles: string[] = []

        if (inventoryAvailable) {
          const byId = productId != null ? productInventoryById.get(productId) : undefined
          const byTitle = byId ? undefined : productInventoryByTitle.get(li.title)
          const qty = byId?.qty ?? byTitle?.qty
          const resolvedProductId = byId ? productId : byTitle?.productId ?? null

          if (qty != null) {
            short = qty < li.quantity
            if (short && resolvedProductId != null) {
              const relations = relatedProducts.relations[String(resolvedProductId)] ?? []
              relatedProductTitles = relations
                .map((r) => productInventoryById.get(Number(r.relatedProductId))?.title)
                .filter((title): title is string => !!title)
                .slice(0, RELATED_PRODUCTS_LIMIT)
            }
          }
        }

        return { title: li.title, quantity: li.quantity, productId, short, relatedProductTitles }
      })

      const stockStatus: LateShipment['stockStatus'] = items.some((i) => i.short === true)
        ? 'sold-out'
        : items.some((i) => i.short === null)
          ? 'unknown'
          : 'in-stock'

      const customerEmail = order.customer?.email || order.email || ''

      return {
        id: order.id,
        orderName: order.name,
        customerName,
        customerEmail,
        createdAt: order.created_at,
        daysLate,
        items,
        totalPrice: order.total_price,
        stockStatus,
        contactedAt: contactedAtByOrder.get(`${order.name}::${customerEmail.toLowerCase()}`) ?? null,
      }
    })

    shipments.sort((a, b) => b.daysLate - a.daysLate)

    return NextResponse.json({ shipments, inventoryAvailable })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

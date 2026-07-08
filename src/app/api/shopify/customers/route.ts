import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { computeTags } from '@/lib/tagging'
import { readManualTags } from '@/lib/customer-tags-storage'
import { readProductCategories } from '@/lib/product-categories-storage'
import type { ShopifyCustomer, ShopifyOrder, ShopifyAbandonedCheckout, AbandonedCheckoutSummary, EnrichedCustomer } from '@/types'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString()

    const manualTagsMap = readManualTags()
    const productCategoryMap = readProductCategories()

    const [customers, recentOrders, abandonedCheckouts] = await Promise.all([
      shopify.getAll<ShopifyCustomer>('/customers.json', 'customers', {
        fields: 'id,first_name,last_name,email,phone,orders_count,total_spent,note,tags,created_at,updated_at,last_order_id,last_order_name,email_marketing_consent',
      }),
      shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
        status: 'any',
        created_at_min: yearAgo,
        fields: 'id,customer,created_at,financial_status,line_items',
      }),
      shopify.getAll<ShopifyAbandonedCheckout>('/checkouts.json', 'checkouts', {
        status: 'open',
        created_at_min: yearAgo,
      }),
    ])

    const abandonedCheckoutsMap = new Map<number, AbandonedCheckoutSummary[]>()
    for (const checkout of abandonedCheckouts) {
      if (!checkout.customer) continue
      const cid = checkout.customer.id
      const list = abandonedCheckoutsMap.get(cid) ?? []
      list.push({
        id: checkout.id,
        createdAt: checkout.created_at,
        totalPrice: checkout.total_price,
        recoveryUrl: checkout.abandoned_checkout_url,
        lineItems: (checkout.line_items ?? []).map((li) => ({ title: li.title, quantity: li.quantity })),
      })
      abandonedCheckoutsMap.set(cid, list)
    }

    // Try to pull real product tags from Shopify (needs read_products scope — falls
    // back to product_type/vendor from the order line items if it's not granted).
    const productIds = [
      ...new Set(
        recentOrders.flatMap((o) => (o.line_items ?? []).map((li) => li.product_id).filter((id): id is number => id != null))
      ),
    ]
    const productTagsMap = new Map<number, string[]>()
    if (productIds.length > 0) {
      try {
        const CHUNK = 200
        for (let i = 0; i < productIds.length; i += CHUNK) {
          const chunk = productIds.slice(i, i + CHUNK)
          const data = await shopify.get<{ products: Array<{ id: number; tags: string }> }>('/products.json', {
            ids: chunk.join(','),
            fields: 'id,tags',
          })
          for (const p of data.products ?? []) {
            const tags = (p.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
            if (tags.length > 0) productTagsMap.set(p.id, tags)
          }
        }
        console.log(`[customers] pulled Shopify product tags for ${productTagsMap.size}/${productIds.length} products`)
      } catch (err) {
        console.warn('[customers] could not fetch product tags (likely missing read_products scope):', err instanceof Error ? err.message : err)
      }
    }

    // Build maps: customerId → last order date, customerId → purchased product categories
    const lastOrderMap = new Map<number, Date>()
    const productTypesMap = new Map<number, Set<string>>()

    for (const order of recentOrders) {
      if (!order.customer) continue
      const cid = order.customer.id

      const existing = lastOrderMap.get(cid)
      const orderDate = new Date(order.created_at)
      if (!existing || orderDate > existing) lastOrderMap.set(cid, orderDate)

      const typeSet = productTypesMap.get(cid) ?? new Set<string>()
      for (const item of order.line_items ?? []) {
        const manualCat = productCategoryMap[item.title]
        const shopifyTags = item.product_id != null ? productTagsMap.get(item.product_id) : undefined
        if (manualCat) {
          typeSet.add(manualCat)
        } else if (shopifyTags && shopifyTags.length > 0) {
          shopifyTags.forEach((t) => typeSet.add(t))
        } else {
          const fallback = item.product_type?.trim()
          if (fallback) typeSet.add(fallback)
        }
      }
      productTypesMap.set(cid, typeSet)
    }

    const enriched: EnrichedCustomer[] = customers.map((c) => {
      const totalSpent = parseFloat(c.total_spent)
      const lastOrderDate = lastOrderMap.get(c.id) ?? null

      const customerAbandonedCheckouts = abandonedCheckoutsMap.get(c.id) ?? []

      const computedTags = computeTags({
        totalSpent,
        ordersCount: c.orders_count,
        lastOrderDate,
        abandonedCheckoutsCount: customerAbandonedCheckouts.length,
      })

      return {
        ...c,
        aov: c.orders_count > 0 ? totalSpent / c.orders_count : 0,
        lastOrderDate: lastOrderDate?.toISOString() ?? null,
        computedTags,
        manualTags: manualTagsMap[String(c.id)] ?? [],
        productTags: Array.from(productTypesMap.get(c.id) ?? []),
        abandonedCheckouts: customerAbandonedCheckouts,
      }
    })

    return NextResponse.json({ customers: enriched })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { readRelatedProducts } from '@/lib/related-products-storage'
import type { ShopifyCustomer, ShopifyOrder, RelatedProductAudience, InterestedCustomersResponse } from '@/types'

interface RouteParams {
  params: { id: string }
}

// Per-related-product breakdown of consented customers who bought that specific related
// product but have never bought the target product — broken down per related product
// (rather than one flattened union) so the client can toggle which related products count
// toward the audience and re-union/dedupe instantly, with no extra network round trip.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const productId = params.id
    const { relations } = readRelatedProducts()
    const relatedIds = (relations[productId] ?? []).map((r) => r.relatedProductId)

    const shopify = createShopifyClient(session)

    if (relatedIds.length === 0) {
      const totalCustomers = await shopify.get<{ count: number }>('/customers/count.json')
      return NextResponse.json({
        totalCustomers: totalCustomers.count,
        byRelatedProduct: [],
        customerEmails: {},
      } satisfies InterestedCustomersResponse)
    }

    const [customers, orders] = await Promise.all([
      shopify.getAll<ShopifyCustomer>('/customers.json', 'customers', {
        fields: 'id,email,email_marketing_consent',
      }),
      shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
        status: 'any',
        created_at_min: '2020-01-01T00:00:00.000Z',
        fields: 'id,customer,line_items',
      }),
    ])

    const consentedById = new Map<number, string>()
    for (const c of customers) {
      if (c.email_marketing_consent?.state === 'subscribed') consentedById.set(c.id, c.email)
    }

    const purchasedByCustomer = new Map<number, Set<string>>()
    for (const order of orders) {
      if (!order.customer) continue
      const set = purchasedByCustomer.get(order.customer.id) ?? new Set<string>()
      for (const item of order.line_items ?? []) {
        if (item.product_id != null) set.add(String(item.product_id))
      }
      purchasedByCustomer.set(order.customer.id, set)
    }

    const customerEmails: Record<number, string> = {}
    const byRelatedProduct: RelatedProductAudience[] = relatedIds.map((relatedProductId) => {
      const customerIds: number[] = []
      for (const [customerId, email] of consentedById) {
        const purchased = purchasedByCustomer.get(customerId)
        if (!purchased || purchased.has(productId)) continue
        if (!purchased.has(relatedProductId)) continue
        customerIds.push(customerId)
        customerEmails[customerId] = email
      }
      return { relatedProductId, customerIds }
    })

    const response: InterestedCustomersResponse = {
      totalCustomers: customers.length,
      byRelatedProduct,
      customerEmails,
    }

    return NextResponse.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

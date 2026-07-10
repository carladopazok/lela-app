import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { readRelatedProducts } from '@/lib/related-products-storage'
import type { ShopifyCustomer, ShopifyOrder, InterestedCustomer, InterestedCustomersResponse } from '@/types'

interface RouteParams {
  params: { id: string }
}

// Customers who bought at least one related product but have never bought this one.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const productId = params.id
    const { relations } = readRelatedProducts()
    const relatedIds = new Set((relations[productId] ?? []).map((r) => r.relatedProductId))

    const shopify = createShopifyClient(session)

    if (relatedIds.size === 0) {
      const totalCustomers = await shopify.get<{ count: number }>('/customers/count.json')
      return NextResponse.json({
        total: 0,
        consented: 0,
        totalCustomers: totalCustomers.count,
        customers: [],
      } satisfies InterestedCustomersResponse)
    }

    const [customers, orders] = await Promise.all([
      shopify.getAll<ShopifyCustomer>('/customers.json', 'customers', {
        fields: 'id,first_name,last_name,email,email_marketing_consent',
      }),
      shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
        status: 'any',
        created_at_min: '2020-01-01T00:00:00.000Z',
        fields: 'id,customer,line_items',
      }),
    ])

    const purchasedByCustomer = new Map<number, Set<string>>()
    for (const order of orders) {
      if (!order.customer) continue
      const set = purchasedByCustomer.get(order.customer.id) ?? new Set<string>()
      for (const item of order.line_items ?? []) {
        if (item.product_id != null) set.add(String(item.product_id))
      }
      purchasedByCustomer.set(order.customer.id, set)
    }

    const interested: InterestedCustomer[] = []
    for (const customer of customers) {
      const purchased = purchasedByCustomer.get(customer.id)
      if (!purchased || purchased.has(productId)) continue
      const boughtRelated = [...relatedIds].some((id) => purchased.has(id))
      if (!boughtRelated) continue

      interested.push({
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        consented: customer.email_marketing_consent?.state === 'subscribed',
      })
    }

    const response: InterestedCustomersResponse = {
      total: interested.length,
      consented: interested.filter((c) => c.consented).length,
      totalCustomers: customers.length,
      customers: interested,
    }

    return NextResponse.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

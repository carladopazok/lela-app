import type { createShopifyClient } from '@/lib/shopify'
import { REVENUE_STATUSES } from '@/lib/shopify-constants'
import type { ShopifyOrder, DailyRevenue, CustomerOrderRow } from '@/types'

// Fetch full order history (not just the backfill window) so that "new vs.
// returning" is correct even for orders near the start of the window — a
// customer's first-ever order may predate it.
export async function fetchOrderHistory(shopify: ReturnType<typeof createShopifyClient>): Promise<ShopifyOrder[]> {
  return shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
    status: 'any',
    created_at_min: '2020-01-01T00:00:00.000Z',
  })
}

export function customerKeyOf(order: ShopifyOrder): string | null {
  return order.customer ? String(order.customer.id) : order.email || null
}

export function computeFirstOrderDates(orders: ShopifyOrder[]): Map<string, string> {
  const firstOrderDate = new Map<string, string>()
  for (const o of orders) {
    const key = customerKeyOf(o)
    if (!key) continue
    const existing = firstOrderDate.get(key)
    if (!existing || o.created_at < existing) firstOrderDate.set(key, o.created_at)
  }
  return firstOrderDate
}

function dayOf(iso: string): string {
  return iso.slice(0, 10)
}

function refundTotal(order: ShopifyOrder): number {
  return (order.refunds ?? []).reduce(
    (sum, r) => sum + (r.transactions ?? []).reduce((s, t) => s + parseFloat(t.amount), 0),
    0
  )
}

/**
 * Computes one DailyRevenue row per day from the full order set, then
 * returns only rows within the trailing `windowDays` (default ~24 months).
 * Refunds are attributed to the order's created_at date, matching the
 * convention already used in sales-overview.ts.
 */
export function buildDailyRevenue(orders: ShopifyOrder[], windowDays = 730): DailyRevenue[] {
  const firstOrderDate = computeFirstOrderDates(orders)

  const rows = new Map<string, DailyRevenue>()
  const newCustomersByDate = new Map<string, Set<string>>()
  const returningCustomersByDate = new Map<string, Set<string>>()

  for (const o of orders) {
    if (!REVENUE_STATUSES.has(o.financial_status)) continue

    const date = dayOf(o.created_at)
    const key = customerKeyOf(o)
    const isNew = key ? firstOrderDate.get(key) === o.created_at : true

    const price = parseFloat(o.total_price)
    const discounts = parseFloat(o.total_discounts || '0')
    const refunds = refundTotal(o)

    const row: DailyRevenue = rows.get(date) ?? {
      date,
      gross_revenue: 0,
      net_revenue: 0,
      order_count: 0,
      new_customer_revenue: 0,
      returning_customer_revenue: 0,
      discount_amount: 0,
      new_customer_count: 0,
      returning_customer_count: 0,
    }
    row.gross_revenue += price
    row.net_revenue += price - refunds
    row.order_count += 1
    row.discount_amount += discounts
    if (isNew) row.new_customer_revenue += price
    else row.returning_customer_revenue += price
    rows.set(date, row)

    if (key) {
      const bucket = isNew ? newCustomersByDate : returningCustomersByDate
      const set = bucket.get(date) ?? new Set<string>()
      set.add(key)
      bucket.set(date, set)
    }
  }

  for (const [date, row] of rows) {
    row.new_customer_count = newCustomersByDate.get(date)?.size ?? 0
    row.returning_customer_count = returningCustomersByDate.get(date)?.size ?? 0
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - windowDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  return Array.from(rows.values())
    .filter((r) => r.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * One row per revenue-counting order, with each customer's acquisition
 * (first-order) date attached. Feeds the Phase 3 cohort/repurchase model,
 * which needs per-customer order history rather than daily aggregates.
 */
export function buildCustomerOrderLedger(orders: ShopifyOrder[]): CustomerOrderRow[] {
  const firstOrderDate = computeFirstOrderDates(orders)

  return orders
    .filter((o) => REVENUE_STATUSES.has(o.financial_status) && customerKeyOf(o))
    .map((o) => {
      const key = customerKeyOf(o) as string
      return {
        customerKey: key,
        orderDate: dayOf(o.created_at),
        acquisitionDate: dayOf(firstOrderDate.get(key) as string),
        revenue: parseFloat(o.total_price),
      }
    })
}

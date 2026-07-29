import { readFileSync, existsSync } from 'fs'
import path from 'path'
import type { ShopifyCustomer, ShopifyOrder, CSTicket, DailyRevenue } from '@/types'
import type { DummyReturnEntry } from '@/lib/shopify-returns'

const DUMMY_DIR = path.join(process.cwd(), 'data', 'dummy')
const CUSTOMERS_FILE = path.join(DUMMY_DIR, 'dummy-customers.json')
const ORDERS_FILE = path.join(DUMMY_DIR, 'dummy-orders.json')
const TICKETS_FILE = path.join(DUMMY_DIR, 'dummy-tickets.json')
const DAILY_REVENUE_FILE = path.join(DUMMY_DIR, 'dummy-daily-revenue.json')
const RETURNS_FILE = path.join(DUMMY_DIR, 'dummy-returns.json')
const LOW_RUNWAY_PRODUCTS_FILE = path.join(DUMMY_DIR, 'dummy-low-runway-products.json')

// Unlike dummy orders/returns (which boost stats for a REAL catalog product matched by title),
// the Low Runway flag also depends on live inventoryQuantity — a number dummy orders can't
// touch. So this is a small standalone product, not a stat boost: the route injects it as a
// synthetic ProductSummary with productId: null, the same "no live Shopify product" shape the
// order-derived fallback catalog already produces, so every existing null-productId UI fallback
// (Fit Note, Stockout Actions, etc.) just works without special-casing.
export interface DummyLowRunwayProduct {
  title: string
  vendor: string
  category: string
  price: number
  inventoryQuantity: number
  unitsSoldMonth: number
  unitsSoldWeek: number
  unitsSold: number
  unitsSoldAllTime: number
  daysSinceLastSold: number
}

function readJsonArray<T>(file: string): T[] {
  try {
    if (!existsSync(file)) return []
    return JSON.parse(readFileSync(file, 'utf-8')) as T[]
  } catch {
    return []
  }
}

export function readDummyCustomers(): ShopifyCustomer[] {
  return readJsonArray<ShopifyCustomer>(CUSTOMERS_FILE)
}

export function readDummyOrders(): ShopifyOrder[] {
  return readJsonArray<ShopifyOrder>(ORDERS_FILE)
}

export function readDummyTickets(): CSTicket[] {
  return readJsonArray<CSTicket>(TICKETS_FILE)
}

export function readDummyDailyRevenue(): DailyRevenue[] {
  return readJsonArray<DailyRevenue>(DAILY_REVENUE_FILE)
}

export function readDummyReturns(): DummyReturnEntry[] {
  return readJsonArray<DummyReturnEntry>(RETURNS_FILE)
}

export function readDummyLowRunwayProducts(): DummyLowRunwayProduct[] {
  return readJsonArray<DummyLowRunwayProduct>(LOW_RUNWAY_PRODUCTS_FILE)
}

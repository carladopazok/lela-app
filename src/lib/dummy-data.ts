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

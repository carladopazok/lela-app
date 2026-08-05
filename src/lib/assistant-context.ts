import { createShopifyClient } from './shopify'
import { getEnrichedCustomers } from './customers'
import { computeRFM, SEGMENT_ORDER } from './rfm'
import { readProductCategories } from './product-categories-storage'
import { readTickets, readMacros, readAgentGuidance } from './cs-storage'
import { REVENUE_STATUSES } from './shopify-constants'
import { STALLED_DAYS, isStalled, getStalledUnitsSummary, isLowRunway, getRunwayDays, getLowRunwaySummary, daysSince } from './product-metrics'
import type { ScoredCustomer } from './rfm'
import type { ShopifyProduct, ShopifyOrder } from '@/types'

type ShopifyClient = ReturnType<typeof createShopifyClient>

interface SimplifiedProduct {
  title: string
  category: string
  status: string
  tags: string[]
  price: number | null
  inventoryQuantity: number
  publishedAt: string | null
  createdAt: string | null
  lastSoldAt: string | null
  unitsSoldMonth: number
}

interface AssistantSnapshot {
  fetchedAt: number
  customers: ScoredCustomer[]
  products: SimplifiedProduct[]
  orders: ShopifyOrder[]
}

// Matches ProductsInventory.tsx's LOW_STOCK_THRESHOLD — kept as a separate constant here
// since that one lives in a client component and isn't exported for server-side reuse.
const LOW_STOCK_THRESHOLD = 3
const MAX_MATCHES = 5
const CACHE_TTL_MS = 2 * 60_000

// Shopify customers/products/orders don't change second-to-second, so a short in-memory
// cache keeps a multi-question chat session from re-fetching the whole store on every
// message. There's no existing cache pattern elsewhere in the app to reuse — this is
// scoped tightly to the assistant's own needs.
let cache: AssistantSnapshot | null = null

interface SalesEntry {
  lastSoldAt: string | null
  unitsSoldMonth: number
}

// Same "no date floor" reasoning as src/app/api/shopify/products/route.ts: knowing whether
// a product is stalled (isStalled, product-metrics.ts) needs its true last-sold date, which
// can be well outside any recent window — a 90-day floor would make every quiet product look
// like it's never sold at all.
function buildSalesMap(orders: ShopifyOrder[]): Map<string, SalesEntry> {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000)
  const map = new Map<string, SalesEntry>()

  for (const order of orders) {
    if (!REVENUE_STATUSES.has(order.financial_status)) continue
    const orderDate = new Date(order.created_at)

    for (const item of order.line_items ?? []) {
      if (!item.title) continue
      const entry = map.get(item.title) ?? { lastSoldAt: null, unitsSoldMonth: 0 }
      if (!entry.lastSoldAt || order.created_at > entry.lastSoldAt) entry.lastSoldAt = order.created_at
      if (orderDate >= monthAgo) entry.unitsSoldMonth += item.quantity
      map.set(item.title, entry)
    }
  }

  return map
}

async function getSnapshot(shopify: ShopifyClient): Promise<AssistantSnapshot> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache

  const [enrichedCustomers, rawProducts, orders] = await Promise.all([
    getEnrichedCustomers(shopify, false),
    shopify.getAll<ShopifyProduct>('/products.json', 'products', {
      fields: 'id,title,vendor,product_type,tags,status,variants,published_at,created_at',
    }),
    shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
      status: 'any',
      fields: 'id,name,email,created_at,financial_status,fulfillment_status,total_price,customer,line_items',
    }),
  ])

  const categoryMap = readProductCategories()
  const salesMap = buildSalesMap(orders)
  const products: SimplifiedProduct[] = rawProducts.map((p) => {
    const sales = salesMap.get(p.title)
    return {
      title: p.title,
      category: categoryMap[p.title] || p.product_type || '',
      status: p.status,
      tags: (p.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      price: p.variants?.[0]?.price ? parseFloat(p.variants[0].price) : null,
      inventoryQuantity: (p.variants ?? []).reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0),
      publishedAt: p.published_at ?? null,
      createdAt: p.created_at ?? null,
      lastSoldAt: sales?.lastSoldAt ?? null,
      unitsSoldMonth: sales?.unitsSoldMonth ?? 0,
    }
  })

  cache = { fetchedAt: Date.now(), customers: computeRFM(enrichedCustomers), products, orders }
  return cache
}

function buildAggregateStats(snapshot: AssistantSnapshot): string {
  const { customers, products, orders } = snapshot

  const segmentCounts = new Map<string, number>()
  for (const c of customers) segmentCounts.set(c.segment, (segmentCounts.get(c.segment) ?? 0) + 1)
  const segmentLines = SEGMENT_ORDER.map((seg) => `${seg}: ${segmentCounts.get(seg) ?? 0}`).join(', ')

  const activeProducts = products.filter((p) => p.status === 'active')
  const outOfStock = activeProducts.filter((p) => p.inventoryQuantity <= 0).length
  const lowStock = activeProducts.filter((p) => p.inventoryQuantity > 0 && p.inventoryQuantity <= LOW_STOCK_THRESHOLD).length
  const stalledCount = activeProducts.filter((p) => isStalled(p, STALLED_DAYS)).length
  const stalledSummary = getStalledUnitsSummary(activeProducts)
  const lowRunwayCount = activeProducts.filter(isLowRunway).length
  const lowRunwaySummary = getLowRunwaySummary(activeProducts)

  const tickets = readTickets()
  const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'needs attention')
  const oldestOpenMs = openTickets.map((t) => new Date(t.receivedAt).getTime()).sort((a, b) => a - b)[0]
  const oldestOpenDays = oldestOpenMs != null ? Math.floor((Date.now() - oldestOpenMs) / 86_400_000) : null

  const macros = readMacros()
  const guidance = readAgentGuidance()

  return [
    `CUSTOMERS: ${customers.length} total. By segment — ${segmentLines}.`,
    `PRODUCTS: ${products.length} total, ${activeProducts.length} active. ${outOfStock} out of stock, ${lowStock} low stock (≤${LOW_STOCK_THRESHOLD} units).`,
    `STALLED INVENTORY — this is the dashboard's "Stalled Inventory" metric (products with no sale in ${STALLED_DAYS}+ days). Three DIFFERENT numbers, do not merge them: stalled product count = ${stalledCount}; total units on hand across those products = ${stalledSummary.units} units (this is the headline figure shown on the dashboard's Stalled Inventory tile — lead with THIS number when asked generally about "stalled inventory"); potential revenue tied up = ~€${stalledSummary.potentialRevenue.toFixed(2)}.`,
    `LOW RUNWAY — the dashboard's "Low Runway" metric (in-stock products projected to sell out soon at recent sales velocity). Two DIFFERENT numbers: product count = ${lowRunwayCount}; revenue at risk = ~€${lowRunwaySummary.revenueAtRisk.toFixed(2)}.`,
    `ORDERS: ${orders.length} total (full order history).`,
    `CS TICKETS: ${tickets.length} total, ${openTickets.length} open/needs attention${oldestOpenDays != null ? `, oldest open ticket is ${oldestOpenDays} days old` : ''}.`,
    `CS MACROS available: ${macros.length ? macros.map((m) => m.name).join(', ') : 'none'}.`,
    `CS AGENT: ${guidance.agentName || '(name not set)'}${guidance.toneOfVoice ? `, tone: ${guidance.toneOfVoice}` : ''}.`,
  ].join('\n')
}

function findMatchingCustomers(question: string, customers: ScoredCustomer[]): ScoredCustomer[] {
  const q = question.toLowerCase()
  const words = q.split(/\s+/).filter((w) => w.length > 2)
  return customers
    .filter((c) => {
      const email = c.email?.toLowerCase() ?? ''
      const name = `${c.first_name} ${c.last_name}`.toLowerCase().trim()
      if (email && q.includes(email)) return true
      if (name && words.some((w) => name.includes(w))) return true
      return false
    })
    .slice(0, MAX_MATCHES)
}

function findMatchingProducts(question: string, products: SimplifiedProduct[]): SimplifiedProduct[] {
  const q = question.toLowerCase()
  const words = q.split(/\s+/).filter((w) => w.length > 3)
  return products
    .filter((p) => {
      const title = p.title.toLowerCase()
      return q.includes(title) || words.some((w) => title.includes(w))
    })
    .slice(0, MAX_MATCHES)
}

function findMatchingOrders(question: string, orders: ShopifyOrder[]): ShopifyOrder[] {
  const match = question.match(/#?(\d{3,6})/)
  if (!match) return []
  const num = match[1]
  return orders.filter((o) => o.name.replace('#', '') === num).slice(0, MAX_MATCHES)
}

const STALLED_KEYWORDS = ['stalled', 'stagnant', 'not selling', 'not moving', 'slow-moving', 'slow moving', 'dead stock', "isn't selling", 'sitting']
const LOW_RUNWAY_KEYWORDS = ['low runway', 'running low', 'about to sell out', 'about to run out', 'stockout', 'stock out']

// Aggregate counts alone can't answer "which products are stalled" — this surfaces the
// specific products behind that count, ranked the same way the Attention Feed would
// (most inventory value tied up first), capped to keep the prompt bounded.
function findStalledProducts(question: string, products: SimplifiedProduct[]): SimplifiedProduct[] {
  const q = question.toLowerCase()
  if (!STALLED_KEYWORDS.some((k) => q.includes(k))) return []
  return products
    .filter((p) => p.status === 'active' && isStalled(p, STALLED_DAYS))
    .sort((a, b) => (b.inventoryQuantity * (b.price ?? 0)) - (a.inventoryQuantity * (a.price ?? 0)))
    .slice(0, MAX_MATCHES)
}

function findLowRunwayProducts(question: string, products: SimplifiedProduct[]): SimplifiedProduct[] {
  const q = question.toLowerCase()
  if (!LOW_RUNWAY_KEYWORDS.some((k) => q.includes(k))) return []
  return products
    .filter((p) => p.status === 'active' && isLowRunway(p))
    .sort((a, b) => (getRunwayDays(a) ?? Infinity) - (getRunwayDays(b) ?? Infinity))
    .slice(0, MAX_MATCHES)
}

function formatCustomerMatch(c: ScoredCustomer): string {
  const tags = [...c.computedTags, ...c.manualTags].join(', ') || 'none'
  return `- ${c.first_name} ${c.last_name} <${c.email}>: segment=${c.segment}, orders=${c.orders_count}, AOV=€${c.aov.toFixed(2)}, last order=${c.lastOrderDate ?? 'never'}, tags=[${tags}]`
}

function formatProductMatch(p: SimplifiedProduct): string {
  const stalled = isStalled(p, STALLED_DAYS)
  const runwayDays = getRunwayDays(p)
  const flags = [
    stalled ? `stalled (no sale in ${daysSince(p.lastSoldAt ?? p.publishedAt ?? p.createdAt ?? new Date().toISOString())} days)` : null,
    runwayDays != null && isLowRunway(p) ? `low runway (~${runwayDays} days left at recent pace)` : null,
  ].filter(Boolean)
  return `- ${p.title} (${p.category || 'uncategorized'}): status=${p.status}, stock=${p.inventoryQuantity} units, price=${p.price != null ? `€${p.price.toFixed(2)}` : 'n/a'}, tags=[${p.tags.join(', ') || 'none'}]${flags.length ? `, flags=[${flags.join('; ')}]` : ''}`
}

function formatOrderMatch(o: ShopifyOrder): string {
  const items = (o.line_items ?? []).map((li) => `${li.quantity}x ${li.title}`).join(', ')
  return `- Order ${o.name} (${o.customer?.email ?? o.email}): placed ${o.created_at}, financial=${o.financial_status}, fulfillment=${o.fulfillment_status ?? 'unfulfilled'}, total=€${o.total_price}, items=[${items}]`
}

// Assembles a text digest grounding the assistant's answer: always-included aggregate
// stats, plus full detail on any customer/product/order the question appears to
// reference, so specific lookups don't have to be guessed from the aggregates alone.
export async function buildAssistantContext(shopify: ShopifyClient, question: string): Promise<string> {
  const snapshot = await getSnapshot(shopify)

  const sections = [buildAggregateStats(snapshot)]

  const matchedCustomers = findMatchingCustomers(question, snapshot.customers)
  if (matchedCustomers.length) sections.push(`MATCHING CUSTOMERS:\n${matchedCustomers.map(formatCustomerMatch).join('\n')}`)

  const matchedProducts = findMatchingProducts(question, snapshot.products)
  if (matchedProducts.length) sections.push(`MATCHING PRODUCTS:\n${matchedProducts.map(formatProductMatch).join('\n')}`)

  const matchedOrders = findMatchingOrders(question, snapshot.orders)
  if (matchedOrders.length) sections.push(`MATCHING ORDERS:\n${matchedOrders.map(formatOrderMatch).join('\n')}`)

  const stalledProducts = findStalledProducts(question, snapshot.products)
  if (stalledProducts.length) sections.push(`STALLED PRODUCTS (by inventory value tied up, highest first):\n${stalledProducts.map(formatProductMatch).join('\n')}`)

  const lowRunwayProducts = findLowRunwayProducts(question, snapshot.products)
  if (lowRunwayProducts.length) sections.push(`LOW RUNWAY PRODUCTS (soonest to sell out first):\n${lowRunwayProducts.map(formatProductMatch).join('\n')}`)

  return sections.join('\n\n')
}

import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import path from 'path'
import type { Session } from '@/lib/session'
import type { ShopifyCustomer, ShopifyOrder, ShopifyLineItem, CSTicket, DailyRevenue, TicketStatus } from '@/types'

const DUMMY_DIR = path.join(process.cwd(), 'data', 'dummy')
const API_VERSION = '2024-10'
const REVENUE_STATUSES = new Set(['paid', 'partially_paid', 'partially_refunded', 'authorized'])

// ─── Bounded Shopify pagination — we only need a representative sample ────────

async function fetchSome<T>(
  session: Session,
  pathname: string,
  key: string,
  params: Record<string, string>,
  maxPages: number
): Promise<T[]> {
  const results: T[] = []
  const base = `https://${session.shop}/admin/api/${API_VERSION}`
  const url = new URL(`${base}${pathname}`)
  url.searchParams.set('limit', '250')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  let pageUrl: string | null = url.toString()
  let pages = 0
  while (pageUrl && pages < maxPages) {
    const res: Response = await fetch(pageUrl, {
      headers: { 'X-Shopify-Access-Token': session.accessToken, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
    const data: Record<string, T[]> = await res.json()
    results.push(...(data[key] ?? []))
    const link = res.headers.get('Link')
    const m = link ? link.match(/<([^>]+)>;\s*rel="next"/) : null
    pageUrl = m ? m[1] : null
    pages++
  }
  return results
}

// ─── Random helpers ────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)]
}
function weightedPick<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [value, weight] of entries) {
    r -= weight
    if (r <= 0) return value
  }
  return entries[entries.length - 1][0]
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function money(n: number): string {
  return round2(n).toFixed(2)
}

// ─── Fabricated identity pools ─────────────────────────────────────────────

const FIRST_NAMES = [
  'Lucia', 'Marcos', 'Elena', 'Daniel', 'Paula', 'Alvaro', 'Carmen', 'Diego', 'Sara', 'Pablo',
  'Laura', 'Javier', 'Ines', 'Hugo', 'Marta', 'Adrian', 'Claudia', 'Sergio', 'Nuria', 'Mario',
  'Sophie', 'Thomas', 'Chloe', 'Lucas', 'Emma', 'Noah', 'Isabella', 'Liam', 'Olivia', 'Mateo',
  'Anna', 'Felix', 'Julia', 'Leon', 'Clara', 'Max', 'Nina', 'Oscar', 'Vera', 'Tom',
]
const LAST_NAMES = [
  'Garcia', 'Martinez', 'Lopez', 'Sanchez', 'Perez', 'Gonzalez', 'Fernandez', 'Ruiz', 'Diaz', 'Moreno',
  'Alvarez', 'Romero', 'Navarro', 'Torres', 'Dominguez', 'Vazquez', 'Ramos', 'Gil', 'Serrano', 'Ortega',
  'Dubois', 'Bernard', 'Petit', 'Roux', 'Weber', 'Schmidt', 'Muller', 'Fischer', 'Rossi', 'Bianchi',
]
const EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'hotmail.com']
const COUNTRIES: [string, string][] = [
  ['Spain', 'ES'], ['Spain', 'ES'], ['Spain', 'ES'], ['Portugal', 'PT'],
  ['France', 'FR'], ['Germany', 'DE'], ['United Kingdom', 'GB'], ['Italy', 'IT'],
  ['United States', 'US'], ['Netherlands', 'NL'],
]
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  ES: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao'],
  PT: ['Lisbon', 'Porto'],
  FR: ['Paris', 'Lyon', 'Marseille'],
  DE: ['Berlin', 'Munich', 'Hamburg'],
  GB: ['London', 'Manchester', 'Bristol'],
  IT: ['Rome', 'Milan', 'Turin'],
  US: ['New York', 'Austin', 'Seattle'],
  NL: ['Amsterdam', 'Rotterdam'],
}

function fakeEmail(first: string, last: string, salt: number): string {
  const cleanFirst = first.toLowerCase().replace(/[^a-z]/g, '')
  const cleanLast = last.toLowerCase().replace(/[^a-z]/g, '')
  return `${cleanFirst}.${cleanLast}${salt}@${pick(EMAIL_DOMAINS)}`
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function monthsFromJan2024ThroughToday(): { months: { year: number; month: number }[]; now: Date } {
  const months: { year: number; month: number }[] = []
  const now = new Date()
  const cursor = new Date(Date.UTC(2024, 0, 1))
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  while (cursor <= currentMonthStart) {
    months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return { months, now }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function randomDateInMonth(year: number, month: number, maxDay: number): Date {
  return new Date(Date.UTC(year, month, randInt(1, maxDay), randInt(0, 23), randInt(0, 59), randInt(0, 59)))
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ─── Catalog + customer harvesting ─────────────────────────────────────────

interface CatalogEntry {
  title: string
  variant_title: string | null
  product_id: number | null
  product_type: string
  vendor: string
  price: number
}

interface RealCustomerRef {
  id: number
  first_name: string
  last_name: string
  email: string
  country: string | null
}

async function harvestCatalog(session: Session): Promise<CatalogEntry[]> {
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString()
  const orders = await fetchSome<{ line_items: ShopifyLineItem[] }>(
    session,
    '/orders.json',
    'orders',
    { status: 'any', created_at_min: yearAgo, fields: 'id,line_items' },
    3
  )
  const catalogMap = new Map<string, CatalogEntry>()
  for (const order of orders) {
    for (const li of order.line_items ?? []) {
      if (!li.title) continue
      const key = `${li.title}::${li.variant_title ?? ''}`
      if (!catalogMap.has(key)) {
        catalogMap.set(key, {
          title: li.title,
          variant_title: li.variant_title ?? null,
          product_id: li.product_id ?? null,
          product_type: li.product_type ?? '',
          vendor: li.vendor ?? '',
          price: parseFloat(li.price) || 9.99,
        })
      }
    }
  }
  return [...catalogMap.values()]
}

async function harvestRealCustomers(session: Session): Promise<RealCustomerRef[]> {
  const customers = await fetchSome<{
    id: number
    first_name: string | null
    last_name: string | null
    email: string | null
    default_address: { country: string | null } | null
  }>(session, '/customers.json', 'customers', { fields: 'id,first_name,last_name,email,default_address' }, 2)

  return customers
    .filter((c) => c.email)
    .map((c) => ({
      id: c.id,
      first_name: c.first_name || 'Customer',
      last_name: c.last_name || '',
      email: c.email as string,
      country: c.default_address?.country ?? null,
    }))
}

// ─── Main generator ─────────────────────────────────────────────────────────

export interface DummyDataSummary {
  customers: number
  orders: number
  tickets: number
  dailyRevenueRows: number
}

export async function generateDummyData(session: Session): Promise<DummyDataSummary> {
  const catalog = await harvestCatalog(session)
  if (catalog.length === 0) {
    throw new Error('No real product line items found in the last year of orders — cannot fabricate realistic dummy sales.')
  }
  const realCustomers = await harvestRealCustomers(session)

  // ─── Fabricate new customers ──────────────────────────────────────────────

  const DUMMY_CUSTOMER_ID_BASE = 9_100_000_000
  const usedEmails = new Set(realCustomers.map((c) => c.email.toLowerCase()))
  const fabricatedCustomers: { id: number; first_name: string; last_name: string; email: string; country: string; countryCode: string }[] = []
  let salt = 1
  while (fabricatedCustomers.length < 40) {
    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)
    const email = fakeEmail(first, last, salt)
    salt++
    if (usedEmails.has(email.toLowerCase())) continue
    usedEmails.add(email.toLowerCase())
    const [countryName, countryCode] = pick(COUNTRIES)
    fabricatedCustomers.push({
      id: DUMMY_CUSTOMER_ID_BASE + fabricatedCustomers.length,
      first_name: first,
      last_name: last,
      email,
      country: countryName,
      countryCode,
    })
  }

  function pickCustomerRef(): { id: number; first_name: string; last_name: string; email: string; isReal: boolean } {
    const useReal = realCustomers.length > 0 && Math.random() < 0.4
    if (useReal) {
      const c = pick(realCustomers)
      return { id: c.id, first_name: c.first_name, last_name: c.last_name, email: c.email, isReal: true }
    }
    const c = pick(fabricatedCustomers)
    return { id: c.id, first_name: c.first_name, last_name: c.last_name, email: c.email, isReal: false }
  }

  // ─── Generate orders ────────────────────────────────────────────────────

  const { months, now } = monthsFromJan2024ThroughToday()
  const orders: ShopifyOrder[] = []
  const dailyRevenueMap = new Map<string, DailyRevenue>()
  const customerAggregates = new Map<number, { count: number; spent: number; firstOrderDate: string; lastOrderDate: string }>()
  const seenCustomerEver = new Set<number>()

  let orderIdCounter = 9_200_000_000
  let orderNumberCounter = 100_000

  for (const { year, month } of months) {
    const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth()
    const totalDaysInMonth = daysInMonth(year, month)
    const maxDay = isCurrentMonth ? now.getUTCDate() : totalDaysInMonth

    let orderCount = randInt(100, 250)
    if (isCurrentMonth) {
      orderCount = Math.max(1, Math.round(orderCount * (maxDay / totalDaysInMonth)))
    }

    for (let i = 0; i < orderCount; i++) {
      const customerRef = pickCustomerRef()
      const createdAt = randomDateInMonth(year, month, maxDay)
      const createdAtIso = createdAt.toISOString()

      const lineItemCount = randInt(1, 4)
      const lineItems: ShopifyLineItem[] = []
      let subtotal = 0
      for (let li = 0; li < lineItemCount; li++) {
        const product = pick(catalog)
        const quantity = randInt(1, 3)
        const price = money(product.price)
        subtotal += parseFloat(price) * quantity
        lineItems.push({
          id: orderIdCounter * 10 + li,
          title: product.title,
          quantity,
          price,
          variant_title: product.variant_title,
          product_id: product.product_id,
          product_type: product.product_type,
          vendor: product.vendor,
          tags: [],
          image_url: null,
        })
      }

      const hasDiscount = Math.random() < 0.12
      const discount = hasDiscount ? round2(subtotal * (randInt(5, 20) / 100)) : 0
      const totalPrice = round2(subtotal - discount)

      const financialStatus = weightedPick<string>([
        ['paid', 0.82],
        ['refunded', 0.05],
        ['partially_refunded', 0.03],
        ['pending', 0.06],
        ['authorized', 0.02],
        ['voided', 0.02],
      ])
      const daysAgo = (now.getTime() - createdAt.getTime()) / 86_400_000
      const fulfillmentStatus: string | null =
        daysAgo < 3
          ? weightedPick<string | null>([['fulfilled', 0.3], [null, 0.6], ['partial', 0.1]])
          : weightedPick<string | null>([['fulfilled', 0.88], [null, 0.07], ['partial', 0.05]])

      const refunds: ShopifyOrder['refunds'] = []
      if (financialStatus === 'refunded' || financialStatus === 'partially_refunded') {
        const refundAmount = financialStatus === 'refunded' ? totalPrice : round2(totalPrice * (randInt(20, 70) / 100))
        refunds.push({
          id: orderIdCounter + 500_000_000,
          created_at: new Date(createdAt.getTime() + randInt(1, 5) * 86_400_000).toISOString(),
          transactions: [{ amount: money(refundAmount) }],
        })
      }

      const fabricated = fabricatedCustomers.find((c) => c.id === customerRef.id)
      const real = realCustomers.find((c) => c.id === customerRef.id)
      const [fallbackCountryName] = pick(COUNTRIES)
      const shippingCountry = fabricated?.country ?? real?.country ?? fallbackCountryName
      const shippingCountryCode = fabricated?.countryCode ?? 'ES'

      const order: ShopifyOrder = {
        id: orderIdCounter++,
        name: `#${orderNumberCounter++}`,
        email: customerRef.email,
        created_at: createdAtIso,
        updated_at: createdAtIso,
        fulfillment_status: fulfillmentStatus,
        financial_status: financialStatus,
        total_price: money(totalPrice),
        subtotal_price: money(subtotal),
        total_discounts: money(discount),
        line_items: lineItems,
        customer: { id: customerRef.id, first_name: customerRef.first_name, last_name: customerRef.last_name, email: customerRef.email },
        shipping_address: {
          first_name: customerRef.first_name,
          last_name: customerRef.last_name,
          city: pick(CITIES_BY_COUNTRY[shippingCountryCode] ?? ['Madrid']),
          province: '',
          country: shippingCountry,
        },
        refunds,
      }
      orders.push(order)

      const key = customerRef.id
      const agg = customerAggregates.get(key) ?? { count: 0, spent: 0, firstOrderDate: createdAtIso, lastOrderDate: createdAtIso }
      agg.count++
      agg.spent = round2(agg.spent + totalPrice)
      if (createdAtIso < agg.firstOrderDate) agg.firstOrderDate = createdAtIso
      if (createdAtIso > agg.lastOrderDate) agg.lastOrderDate = createdAtIso
      customerAggregates.set(key, agg)

      const dateKey = isoDateOnly(createdAt)
      const dr = dailyRevenueMap.get(dateKey) ?? {
        date: dateKey,
        gross_revenue: 0,
        net_revenue: 0,
        order_count: 0,
        new_customer_revenue: 0,
        returning_customer_revenue: 0,
        discount_amount: 0,
        new_customer_count: 0,
        returning_customer_count: 0,
      }
      if (REVENUE_STATUSES.has(financialStatus)) {
        dr.gross_revenue = round2(dr.gross_revenue + totalPrice)
        const refundTotal = refunds.reduce((s, r) => s + r.transactions.reduce((s2, t) => s2 + parseFloat(t.amount), 0), 0)
        dr.net_revenue = round2(dr.net_revenue + totalPrice - refundTotal)
        dr.order_count++
        dr.discount_amount = round2(dr.discount_amount + discount)

        if (!seenCustomerEver.has(key)) {
          dr.new_customer_revenue = round2(dr.new_customer_revenue + totalPrice)
          dr.new_customer_count++
        } else {
          dr.returning_customer_revenue = round2(dr.returning_customer_revenue + totalPrice)
          dr.returning_customer_count++
        }
      }
      seenCustomerEver.add(key)
      dailyRevenueMap.set(dateKey, dr)
    }
  }

  // ─── Finalize fabricated customer records ─────────────────────────────────

  const dummyCustomers: ShopifyCustomer[] = fabricatedCustomers.map((c) => {
    const agg = customerAggregates.get(c.id) ?? { count: 0, spent: 0, firstOrderDate: null as unknown as string, lastOrderDate: null as unknown as string }
    return {
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: null,
      orders_count: agg.count,
      total_spent: money(agg.spent),
      note: null,
      tags: '',
      created_at: agg.firstOrderDate ?? new Date().toISOString(),
      updated_at: agg.lastOrderDate ?? new Date().toISOString(),
      last_order_id: null,
      last_order_name: null,
      email_marketing_consent: {
        state: weightedPick<'subscribed' | 'not_subscribed' | 'unsubscribed'>([
          ['subscribed', 0.6],
          ['not_subscribed', 0.3],
          ['unsubscribed', 0.1],
        ]),
        opt_in_level: 'single_opt_in',
        consent_updated_at: agg.firstOrderDate ?? null,
      },
      default_address: { country: c.country, country_code: c.countryCode },
    }
  })

  const dailyRevenue = [...dailyRevenueMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  // ─── Generate CS tickets ────────────────────────────────────────────────

  const TICKET_TEMPLATES: { tag: string; subject: string; body: (name: string) => string; reply: string }[] = [
    {
      tag: 'order issue',
      subject: 'Question about my order',
      body: (name) => `Hi, I just wanted to check on the status of my recent order — everything alright on your end? Thanks, ${name}`,
      reply: 'Thanks for reaching out! Your order is on track — you should see tracking details shortly. Let us know if anything looks off.',
    },
    {
      tag: 'shipping',
      subject: 'Delivery is taking longer than expected',
      body: (name) => `Hello, my order hasn't arrived yet and it's been a little while. Could you let me know where things stand? — ${name}`,
      reply: "Sorry for the delay! We've checked with the carrier and your package is en route — it should land in the next couple of days.",
    },
    {
      tag: 'refund',
      subject: 'Requesting a refund',
      body: (name) => `Hi there, I'd like to request a refund for my last order, it didn't quite work out for me. Thanks, ${name}`,
      reply: "No problem at all — we've processed the refund on our end, it should appear on your statement within a few business days.",
    },
    {
      tag: 'product question',
      subject: 'Quick question before I order again',
      body: (name) => `Hey! Loved my last purchase and had a quick question about sizing/materials before I order again. — ${name}`,
      reply: "Great question! Happy to help — here's a bit more detail, and let us know if you'd like a recommendation for your next order.",
    },
    {
      tag: 'general',
      subject: 'Thanks for the great service',
      body: (name) => `Just wanted to say thank you — really happy with my order and the whole experience. — ${name}`,
      reply: "That means a lot, thank you for the kind words! We'll pass it along to the team.",
    },
  ]

  const allPeople = [
    ...realCustomers.map((c) => ({ email: c.email, name: `${c.first_name} ${c.last_name}`.trim() })),
    ...fabricatedCustomers.map((c) => ({ email: c.email, name: `${c.first_name} ${c.last_name}`.trim() })),
  ]

  const ticketCount = randInt(80, 150)
  const statusPool: [TicketStatus, number][] = [
    ['open', 0.2],
    ['needs attention', 0.15],
    ['archived', 0.4],
    ['resolved', 0.25],
  ]
  const tickets: CSTicket[] = []
  const rangeStart = new Date(Date.UTC(2024, 0, 1)).getTime()
  const rangeEnd = now.getTime()

  for (let i = 0; i < ticketCount; i++) {
    const person = pick(allPeople)
    const template = pick(TICKET_TEMPLATES)
    const receivedAt = new Date(rangeStart + Math.random() * (rangeEnd - rangeStart))
    const status = weightedPick<TicketStatus>(statusPool)

    const thread: CSTicket['thread'] = [
      {
        id: randomUUID(),
        direction: 'inbound',
        body: template.body(person.name.split(' ')[0] || person.name),
        from: person.email,
        sentAt: receivedAt.toISOString(),
      },
    ]
    if (status !== 'open' || Math.random() < 0.5) {
      thread.push({
        id: randomUUID(),
        direction: 'outbound',
        body: template.reply,
        from: 'support@carladopazo.com',
        sentAt: new Date(receivedAt.getTime() + randInt(1, 48) * 3_600_000).toISOString(),
      })
    }

    tickets.push({
      id: randomUUID(),
      subject: template.subject,
      from: person.email,
      fromName: person.name,
      receivedAt: receivedAt.toISOString(),
      messageId: `dummy-${randomUUID()}`,
      status,
      tags: [template.tag],
      thread,
    })
  }

  // ─── Write output ───────────────────────────────────────────────────────

  if (!existsSync(DUMMY_DIR)) mkdirSync(DUMMY_DIR, { recursive: true })
  writeFileSync(path.join(DUMMY_DIR, 'dummy-customers.json'), JSON.stringify(dummyCustomers, null, 2))
  writeFileSync(path.join(DUMMY_DIR, 'dummy-orders.json'), JSON.stringify(orders, null, 2))
  writeFileSync(path.join(DUMMY_DIR, 'dummy-tickets.json'), JSON.stringify(tickets, null, 2))
  writeFileSync(path.join(DUMMY_DIR, 'dummy-daily-revenue.json'), JSON.stringify(dailyRevenue, null, 2))

  return {
    customers: dummyCustomers.length,
    orders: orders.length,
    tickets: tickets.length,
    dailyRevenueRows: dailyRevenue.length,
  }
}

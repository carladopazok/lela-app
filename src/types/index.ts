// ─── Shopify ────────────────────────────────────────────────────────────────

export interface ShopifyLineItem {
  id: number
  title: string
  quantity: number
  price: string
  variant_title: string | null
  product_id: number | null
  product_type: string
  vendor: string
  tags: string[]
  image_url: string | null
}

export interface ShopifyAddress {
  first_name: string
  last_name: string
  city: string
  province: string
  country: string
}

export interface ShopifyOrder {
  id: number
  name: string
  email: string
  created_at: string
  updated_at: string
  fulfillment_status: string | null
  financial_status: string
  total_price: string
  subtotal_price: string
  total_discounts: string
  total_refunds?: string
  line_items: ShopifyLineItem[]
  customer: {
    id: number
    first_name: string
    last_name: string
    email: string
  } | null
  shipping_address: ShopifyAddress | null
  refunds: Array<{
    id: number
    created_at: string
    transactions: Array<{ amount: string }>
  }>
}

export interface ShopifyAbandonedCheckout {
  id: number
  email: string | null
  created_at: string
  total_price: string
  abandoned_checkout_url: string | null
  customer: { id: number } | null
  line_items: Array<{ title: string; quantity: number }>
}

export interface AbandonedCheckoutSummary {
  id: number
  createdAt: string
  totalPrice: string
  recoveryUrl: string | null
  lineItems: Array<{ title: string; quantity: number }>
}

export interface ShopifyCustomer {
  id: number
  first_name: string
  last_name: string
  email: string
  phone: string | null
  orders_count: number
  total_spent: string
  note: string | null
  tags: string
  created_at: string
  updated_at: string
  last_order_id: number | null
  last_order_name: string | null
  email_marketing_consent: {
    state: 'subscribed' | 'unsubscribed' | 'not_subscribed' | 'pending'
    opt_in_level: string
    consent_updated_at: string | null
  } | null
  default_address: {
    country: string | null
    country_code: string | null
  } | null
}

// ─── Omnisend ───────────────────────────────────────────────────────────────

export interface OmnisendCampaign {
  campaignID: string
  name: string
  status: string
  type: string
  subject?: string
  fromName?: string
  createdAt: string
  updatedAt?: string
  startDate?: string | null
  endDate?: string | null
  // Flat engagement counters (actual API shape)
  sent: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  unsubscribed: number
}

export interface OmnisendContact {
  contactID: string
  email: string
  firstName?: string
  lastName?: string
  status: string
  statusDate?: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

// ─── App-level ──────────────────────────────────────────────────────────────

export const CUSTOMER_TAGS = ['VIP', 'loyal', 'active', '1-order', 'winback', 'at-risk', 'lapsed', 'lost', 'never-purchased', 'abandoned-checkout'] as const
export type CustomerTag = string

export interface EnrichedCustomer extends ShopifyCustomer {
  aov: number
  lastOrderDate: string | null
  computedTags: CustomerTag[]
  manualTags: string[]
  productTags: string[]   // unique product_type values from purchase history
  abandonedCheckouts: AbandonedCheckoutSummary[]
  country: string | null
}

export interface LateShipment {
  id: number
  orderName: string
  customerName: string
  customerEmail: string
  createdAt: string
  daysLate: number
  items: Array<{
    title: string
    quantity: number
    productId: number | null
    short: boolean | null
    relatedProductTitles: string[]
  }>
  totalPrice: string
  stockStatus: 'in-stock' | 'sold-out' | 'unknown'
  contactedAt: string | null
}

export interface SalesMetrics {
  totalRevenue: number
  orderCount: number
  aov: number
  totalRefunds: number
  currency: string
  periodDays: number
}

// ─── Customer Service ───────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'needs attention' | 'archived' | 'resolved' | 'spam'

export const TICKET_TAGS = ['order issue', 'refund', 'shipping', 'product question', 'general', 'marketing messages'] as const
export type TicketTag = string

export interface CSMessage {
  id: string
  direction: 'inbound' | 'outbound' | 'note'
  body: string
  from: string
  sentAt: string
}

export interface CSTicket {
  id: string
  subject: string
  from: string
  fromName: string
  receivedAt: string
  messageId: string
  status: TicketStatus
  tags: TicketTag[]
  thread: CSMessage[]
  relatedOrderName?: string
}

export interface CSMacro {
  id: string
  name: string
  body: string
  createdAt: string
  updatedAt?: string
}

// ─── Forecasting ────────────────────────────────────────────────────────────

export interface DailyRevenue {
  date: string // YYYY-MM-DD
  gross_revenue: number
  net_revenue: number
  order_count: number
  new_customer_revenue: number
  returning_customer_revenue: number
  discount_amount: number
  new_customer_count: number
  returning_customer_count: number
}

export interface CampaignFlowRevenue {
  send_date: string // YYYY-MM-DD
  campaign_or_flow_id: string
  type: 'campaign' | 'flow'
  name: string
  attributed_revenue: number | null
  sent_count: number
  click_count: number
}

export interface ForecastMeta {
  lastBackfillAt: string | null
  lastRefreshAt: string | null
  omnisendAttributionAvailable: boolean
}

export interface CustomerOrderRow {
  customerKey: string
  orderDate: string // YYYY-MM-DD
  acquisitionDate: string // YYYY-MM-DD — this customer's first-ever order date
  revenue: number
}

export interface ForecastPoint {
  date: string
  actual: number | null
  forecast: number
  priorYear: number | null
  actualOrderCount: number | null
  forecastOrderCount: number
  priorYearOrderCount: number | null
}

// ─── Products & Inventory ───────────────────────────────────────────────────

export interface ProductSummary {
  title: string
  category: string | null
  imageUrl: string | null
  vendor: string
  unitsSold: number       // trailing 365 days
  unitsSoldWeek: number   // trailing 7 days
  unitsSoldMonth: number  // trailing 30 days
  revenue: number         // trailing 365 days
  ordersCount: number
  productId: number | null        // Shopify product id — only set when source === 'catalog'
  sku: string | null              // first variant's SKU
  inventoryQuantity: number | null // sum of variant inventory_quantity — null when catalog unavailable
  status: string | null           // 'active' | 'draft' | 'archived' | null
  publishedAt: string | null      // null = not live on the Online Store channel
  createdAt: string | null        // Shopify product created_at — fallback reference for stalled calc when never sold
  price: number | null            // first variant price
  lastSoldAt: string | null       // most recent order date seen for this title, null if never sold
  cogs: number | null             // manually entered cost, from data/product-cogs.json, keyed by product id
  nativeCogs: number | null       // Shopify's "Cost per item" (InventoryItem.cost), first variant
  hasSoldOutVariant: boolean      // true if any single variant is at 0 — distinct from inventoryQuantity, which sums across variants
  returnRate: number | null       // qualifying-reason returns ÷ all-time units sold; null if never sold or read_returns unavailable
  returnFlagged: boolean          // returnRate > 20% AND at least 5 units sold all-time
  returnedUnits: number           // qualifying-reason units returned — numerator behind returnRate
  unitsSoldAllTime: number        // denominator behind returnRate, no date floor
  returnReasons: Record<string, number> | null // units returned per Shopify returnReason, incl. the OTHER/UNKNOWN ones excluded from the flag; null when read_returns unavailable
}

// ─── Back in Stock signups ──────────────────────────────────────────────────

export interface BackInStockSignup {
  email: string
  variantId: number
  variantTitle: string | null
  createdAt: string
}

export type BackInStockStore = Record<string, BackInStockSignup[]> // keyed by product id (string)

export interface BackInStockVariantStatus {
  variantId: number
  variantTitle: string | null
  inventoryQuantity: number | null
  signups: BackInStockSignup[]
}

export interface BackInStockResponse {
  productId: string
  variants: BackInStockVariantStatus[]
}

export interface ShopifyProductVariant {
  id: number
  title: string
  price: string
  inventory_quantity: number | null
  sku: string
  inventory_item_id: number
}

export interface ShopifyProduct {
  id: number
  title: string
  vendor: string
  product_type: string
  tags: string
  status: string
  image: { src: string } | null
  variants: ShopifyProductVariant[]
  published_at: string | null
  created_at: string
}

export interface ShopifyInventoryItem {
  id: number
  cost: string | null
}

export interface ProductsResponse {
  products: ProductSummary[]
  currency: string
  locale: string
  source: 'catalog' | 'orders'
  inventoryAvailable: boolean
  returnsAvailable: boolean
}

// ─── Related Products / Cross-sell ─────────────────────────────────────────

export type RelationType = 'same-tag' | 'frequently-bought-together'

export interface RelatedProductEntry {
  relatedProductId: string
  relationType: RelationType
  coPurchaseCount: number | null // null for same-tag relations
}

export interface RelatedProductsData {
  computedAt: string | null
  minSharedOrders: number
  relations: Record<string, RelatedProductEntry[]> // keyed by product id (string)
}

export interface RelatedProductAudience {
  relatedProductId: string
  customerIds: number[] // consented customers who bought this related product, haven't bought the target product
}

export interface InterestedCustomersResponse {
  totalCustomers: number // size of the whole customer base
  byRelatedProduct: RelatedProductAudience[]
  customerEmails: Record<number, string> // customer id -> email, only for ids appearing above
}

export interface CampaignRow {
  id: string
  name: string
  status: string
  sentAt: string
  totalSent: number
  openRate: number | null
  clickRate: number | null
  bounced: number
  complained: number
  unsubscribed: number
  attributedRevenue: number | null
  currency: string
}

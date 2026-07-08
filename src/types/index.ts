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

export const CUSTOMER_TAGS = ['VIP', '1-order', 'never-purchased', 'winback', 'abandoned-checkout'] as const
export type CustomerTag = string

export interface EnrichedCustomer extends ShopifyCustomer {
  aov: number
  lastOrderDate: string | null
  computedTags: CustomerTag[]
  manualTags: string[]
  productTags: string[]   // unique product_type values from purchase history
  abandonedCheckouts: AbandonedCheckoutSummary[]
}

export interface LateShipment {
  id: number
  orderName: string
  customerName: string
  customerEmail: string
  createdAt: string
  daysLate: number
  items: Array<{ title: string; quantity: number }>
  totalPrice: string
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

export type TicketStatus = 'open' | 'needs attention' | 'archived' | 'resolved'

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
}

export interface CSMacro {
  id: string
  name: string
  body: string
  createdAt: string
  updatedAt?: string
}

export interface CampaignRow {
  id: string
  name: string
  status: string
  sentAt: string
  totalSent: number
  openRate: number | null
  clickRate: number | null
  attributedRevenue: number | null
  currency: string
}

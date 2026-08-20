import type { EnrichedCustomer } from '@/types'

export type LifecycleStage =
  | 'Never Purchased'
  | 'New'
  | 'Active'
  | 'Winback'
  | 'Loyal'
  | 'VIP'
  | 'At Risk'
  | 'Lapsed'
  | 'Lost'

export const LIFECYCLE_STAGE_ORDER: LifecycleStage[] = [
  'Never Purchased', 'New', 'Active', 'Loyal', 'VIP', 'Winback', 'At Risk', 'Lapsed', 'Lost',
]

export const LIFECYCLE_STAGE_META: Record<LifecycleStage, { bg: string; text: string; border: string }> = {
  'Never Purchased': { bg: 'bg-sand-200',   text: 'text-charcoal-700', border: 'border-sand-300' },
  'New':             { bg: 'bg-violet-100', text: 'text-violet-700',   border: 'border-violet-200' },
  'Active':          { bg: 'bg-blue-100',   text: 'text-blue-700',     border: 'border-blue-200' },
  'Winback':         { bg: 'bg-orange-100', text: 'text-orange-700',   border: 'border-orange-200' },
  'Loyal':           { bg: 'bg-teal-100',   text: 'text-teal-700',     border: 'border-teal-200' },
  'VIP':             { bg: 'bg-teal-100',   text: 'text-teal-700',     border: 'border-teal-200' },
  'At Risk':         { bg: 'bg-amber-100',  text: 'text-amber-700',    border: 'border-amber-200' },
  'Lapsed':          { bg: 'bg-red-100',    text: 'text-red-700',      border: 'border-red-200' },
  'Lost':            { bg: 'bg-red-100',    text: 'text-red-700',      border: 'border-red-200' },
}

// ─── Business rules — single source of truth ───────────────────────────────
// Shared by the Customers tab (src/lib/tagging.ts) and the Journey tab
// (src/lib/journey.ts) so a customer's status can never disagree between the
// two. These are business thresholds, not technical constants — expect to
// tune them; each one is commented with what it controls.
//
// Changelog:
// - 2026-07-15  Unified two previously-independent, drifted systems:
//   tagging.ts used to tag 'VIP' at 2+ orders with no recency check at all, and
//   'winback' co-occurred with '1-order' (additive, not exclusive — a bug).
//   journey.ts used to run its own separate 90/180/365-day waterfall, partly
//   depending on rfm.ts's quintile-ranked RFM segment (a moving target, since
//   quintiles re-rank against whoever else happens to be a customer right now,
//   not a fixed threshold). This file replaces both with one fixed-threshold
//   classifier; rfm.ts / the RFM Analysis tab is untouched and stays a separate
//   analytical lens, no longer an input to lifecycle classification.
// - 2026-07-15  Re-added 'Active' (2-3 orders, recent) between 'New' and 'Loyal' —
//   the initial unification had folded it into 'Loyal'. 'Loyal' and 'VIP' shifted
//   up to make room: Loyal was 2+/4+, now 4-6/7+.
// - 2026-08-20  Reworked the decay waterfall for the Journey tab's new two-row
//   branching diagram: added WINBACK_START_DAYS (70) as its own tier ahead of
//   AT_RISK_START_DAYS (45→90); LAPSED_START_DAYS moved 90→120; LOST_DAYS stays
//   180. Winback and At Risk are now order-count-independent — dropped the old
//   "1 order → Winback, 2+ orders → At Risk" split. This also REVERSES the
//   2026-07-15 decision that VIP skips the At Risk/Lapsed/Winback tiers: VIPs
//   now decay through Winback → At Risk → Lapsed → Lost on the same recency
//   thresholds as everyone else, only reachable via order count (7+), no longer
//   exempt from it.

/** Orders needed to leave 'Active' and become 'Loyal'. Below this (2-3 orders),
 *  a recent repeat customer is 'Active'. */
export const LOYAL_MIN_ORDERS = 4

/** Orders needed to be 'VIP' instead of 'Loyal'. Order-count-based rather than a
 *  spend threshold — deliberately, since there's no store-specific AOV data this
 *  app can use to pick a defensible euro figure yet. */
export const VIP_MIN_ORDERS = 7

/** Days since last order before any customer — any order count, including VIP —
 *  is flagged 'Winback'. Below this, stage is decided purely by order count:
 *  1 order is 'New', 2-3 is 'Active', 4-6 is 'Loyal', 7+ is 'VIP'. */
export const WINBACK_START_DAYS = 70

/** Days since last order before a 'Winback' customer becomes 'At Risk'. Order-
 *  count-independent, same as WINBACK_START_DAYS. */
export const AT_RISK_START_DAYS = 90

/** Days since last order before anyone becomes 'Lapsed', regardless of order
 *  count or which tier ('New'/'Winback'/'At Risk'/'Loyal'/'VIP') they were in. */
export const LAPSED_START_DAYS = 120

/** Days since last order before anyone is 'Lost' — including VIPs. VIP status no
 *  longer grants any recency exemption (see 2026-08-20 changelog above); it only
 *  takes more orders to reach VIP in the first place. */
export const LOST_DAYS = 180

/** How fresh an abandoned checkout must be to still count as "recent". This is an
 *  independent overlay flag (see hasRecentAbandonedCheckout), not a lifecycle
 *  stage — a VIP can simultaneously have a recent abandoned cart on something new. */
export const ABANDONED_CHECKOUT_WINDOW_DAYS = 14

export interface SegmentationInput {
  ordersCount: number
  lastOrderDate: Date | null
  emailMarketingConsentState?: string | null
}

function daysSince(date: Date | null): number {
  if (!date) return Infinity
  return (Date.now() - date.getTime()) / 86_400_000
}

// The one classifier both the Customers tab and the Journey tab call. First
// matching rule wins. Pure function of fresh ordersCount/lastOrderDate — a
// Winback/At Risk/Lapsed customer who places a new order is automatically
// reclassified into New/Active/Loyal/VIP on the very next call, no separate
// "reconversion" state or logic needed anywhere.
export function classifyCustomerStage(input: SegmentationInput): LifecycleStage {
  if (input.ordersCount === 0) return 'Never Purchased'
  if (input.emailMarketingConsentState === 'unsubscribed') return 'Lost'

  const days = daysSince(input.lastOrderDate)
  if (days > LOST_DAYS) return 'Lost'
  if (days > LAPSED_START_DAYS) return 'Lapsed'
  if (days > AT_RISK_START_DAYS) return 'At Risk'
  if (days > WINBACK_START_DAYS) return 'Winback'
  if (input.ordersCount === 1) return 'New'
  if (input.ordersCount >= VIP_MIN_ORDERS) return 'VIP'
  if (input.ordersCount >= LOYAL_MIN_ORDERS) return 'Loyal'
  return 'Active'
}

export interface AbandonedCheckoutLike {
  createdAt: string
}

// Independent overlay — can be true alongside any LifecycleStage, not just
// 'Never Purchased'. Replaces the old check (any open checkout counted,
// regardless of age, as long as it was within the API's 1-year fetch window).
export function hasRecentAbandonedCheckout(checkouts: AbandonedCheckoutLike[]): boolean {
  return checkouts.some((co) => daysSince(new Date(co.createdAt)) <= ABANDONED_CHECKOUT_WINDOW_DAYS)
}

export interface CustomerStageResult {
  id: number
  email: string
  stage: LifecycleStage
}

// Runs classifyCustomerStage across a full customer list, keeping enough identity
// (id, email) to act on the result — used by /api/sync-stages, which needs to know
// *which* customer changed stage, not just aggregate counts (that's what
// computeJourneyCounts in src/lib/journey.ts is for).
export function getCustomerStages(customers: EnrichedCustomer[]): CustomerStageResult[] {
  return customers.map((c) => ({
    id: c.id,
    email: c.email,
    stage: classifyCustomerStage({
      ordersCount: c.orders_count,
      lastOrderDate: c.lastOrderDate ? new Date(c.lastOrderDate) : null,
      emailMarketingConsentState: c.email_marketing_consent?.state,
    }),
  }))
}

export const STAGE_TRANSITION_RULES: Record<LifecycleStage, string> = {
  'Never Purchased': '0 completed orders',
  New: `Exactly 1 order, within ${WINBACK_START_DAYS} days of it`,
  Active: `2–${LOYAL_MIN_ORDERS - 1} orders, most recent within ${WINBACK_START_DAYS} days`,
  Loyal: `${LOYAL_MIN_ORDERS}–${VIP_MIN_ORDERS - 1} orders, most recent within ${WINBACK_START_DAYS} days`,
  VIP: `${VIP_MIN_ORDERS}+ orders, most recent within ${WINBACK_START_DAYS} days`,
  Winback: `Any order count, ${WINBACK_START_DAYS}–${AT_RISK_START_DAYS - 1} days since last order`,
  'At Risk': `Any order count, ${AT_RISK_START_DAYS}–${LAPSED_START_DAYS - 1} days since last order`,
  Lapsed: `Any order count, ${LAPSED_START_DAYS}–${LOST_DAYS - 1} days since last order`,
  Lost: `${LOST_DAYS}+ days since last order, or unsubscribed from email marketing`,
}

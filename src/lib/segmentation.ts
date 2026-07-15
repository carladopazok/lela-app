export type LifecycleStage =
  | 'Never Purchased'
  | 'New'
  | 'Winback'
  | 'Loyal'
  | 'VIP'
  | 'At Risk'
  | 'Lapsed'
  | 'Lost'

export const LIFECYCLE_STAGE_ORDER: LifecycleStage[] = [
  'Never Purchased', 'New', 'Winback', 'Loyal', 'VIP', 'At Risk', 'Lapsed', 'Lost',
]

export const LIFECYCLE_STAGE_META: Record<LifecycleStage, { bg: string; text: string; border: string }> = {
  'Never Purchased': { bg: 'bg-sand-200',   text: 'text-charcoal-700', border: 'border-sand-300' },
  'New':             { bg: 'bg-violet-100', text: 'text-violet-700',   border: 'border-violet-200' },
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

/** Orders needed to be 'VIP' instead of 'Loyal'. Order-count-based rather than a
 *  spend threshold — deliberately, since there's no store-specific AOV data this
 *  app can use to pick a defensible euro figure yet. */
export const VIP_MIN_ORDERS = 4

/** Days since last order before a repeat customer below the VIP tier is flagged
 *  ('At Risk'), or a one-time buyer is flagged ('Winback'). Below this, a 1-order
 *  customer is 'New' and a 2+-order non-VIP customer is 'Loyal'. */
export const AT_RISK_START_DAYS = 45

/** Days since last order before anyone below the VIP tier becomes 'Lapsed',
 *  regardless of whether they were 'New'/'Winback'/'At Risk'. */
export const LAPSED_START_DAYS = 90

/** Days since last order before anyone is 'Lost' — including VIPs. VIP status
 *  grants a longer runway (full 'VIP' status up to this same cutoff, skipping
 *  the At Risk/Lapsed tiers entirely) but doesn't avoid Lost past this point. */
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
// matching rule wins.
export function classifyCustomerStage(input: SegmentationInput): LifecycleStage {
  if (input.ordersCount === 0) return 'Never Purchased'
  if (input.emailMarketingConsentState === 'unsubscribed') return 'Lost'

  const days = daysSince(input.lastOrderDate)
  if (days > LOST_DAYS) return 'Lost'
  if (input.ordersCount >= VIP_MIN_ORDERS) return 'VIP'
  if (days > LAPSED_START_DAYS) return 'Lapsed'
  if (days > AT_RISK_START_DAYS) return input.ordersCount === 1 ? 'Winback' : 'At Risk'
  if (input.ordersCount === 1) return 'New'
  return 'Loyal'
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

export const STAGE_TRANSITION_RULES: Record<LifecycleStage, string> = {
  'Never Purchased': '0 completed orders',
  New: `Exactly 1 order, within ${AT_RISK_START_DAYS} days of it`,
  Winback: `Exactly 1 order, ${AT_RISK_START_DAYS}–${LAPSED_START_DAYS - 1} days since it`,
  Loyal: `2–${VIP_MIN_ORDERS - 1} orders, most recent within ${AT_RISK_START_DAYS} days`,
  VIP: `${VIP_MIN_ORDERS}+ orders, most recent within ${LOST_DAYS} days`,
  'At Risk': `2+ orders (below VIP tier), ${AT_RISK_START_DAYS}–${LAPSED_START_DAYS - 1} days since last order`,
  Lapsed: `${LAPSED_START_DAYS}–${LOST_DAYS - 1} days since last order`,
  Lost: `${LOST_DAYS}+ days since last order, or unsubscribed from email marketing`,
}

import type { EnrichedCustomer } from '@/types'
import { classifyCustomerStage, type LifecycleStage } from './segmentation'

export type RFMSegment =
  | 'Champions'
  | 'Loyal'
  | 'Potential Loyalists'
  | 'Needs Attention'
  | 'At Risk'
  | 'Lost'
  | 'Never Purchased'

export interface ScoredCustomer extends EnrichedCustomer {
  rfm: { r: number; f: number; m: number }
  segment: RFMSegment
}

export const SEGMENT_ORDER: RFMSegment[] = [
  'Champions',
  'Loyal',
  'Potential Loyalists',
  'Needs Attention',
  'At Risk',
  'Lost',
  'Never Purchased',
]

// Segments with a real RFM score — excludes 'Never Purchased', which is outside
// RFM's mathematical scope (no recency/frequency/monetary to score). Used by the
// RFM Analysis tab's distribution bar/legend/cards. Segments.tsx's "By Cohort"
// filter still uses the full SEGMENT_ORDER so 'Never Purchased' stays filterable there.
export const BUYER_SEGMENT_ORDER: RFMSegment[] = SEGMENT_ORDER.filter((s) => s !== 'Never Purchased')

export const SEGMENT_META: Record<
  RFMSegment,
  {
    bar: string        // solid bg class for stacked bar
    bg: string         // light bg for cards/badges
    text: string       // text color
    border: string     // border color
    hex: string        // hex for inline style fallback
    description: string
    action: string
  }
> = {
  'Champions': {
    bar: 'bg-terracotta-500', bg: 'bg-terracotta-50', text: 'text-terracotta-700', border: 'border-terracotta-200',
    hex: '#c2614f',
    description: 'Bought recently, buy often, spend the most',
    action: 'Reward & upsell',
  },
  'Loyal': {
    bar: 'bg-teal-500', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200',
    hex: '#14b8a6',
    description: 'Regular buyers, consistent lifetime value',
    action: 'Loyalty programme',
  },
  'Potential Loyalists': {
    bar: 'bg-olive-500', bg: 'bg-olive-50', text: 'text-olive-700', border: 'border-olive-200',
    hex: '#5a7a4e',
    description: 'Bought recently, but infrequent so far',
    action: 'Nurture to loyalty',
  },
  'Needs Attention': {
    bar: 'bg-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200',
    hex: '#facc15',
    description: 'Mid-range recency and frequency — fading',
    action: 'Re-engage before they drift',
  },
  'At Risk': {
    bar: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200',
    hex: '#f59e0b',
    description: 'Used to buy often — gone quiet recently',
    action: 'Win-back campaign now',
  },
  'Lost': {
    bar: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200',
    hex: '#ef4444',
    description: 'Long inactive, low recency and frequency',
    action: 'Last-chance offer',
  },
  'Never Purchased': {
    bar: 'bg-sand-300', bg: 'bg-sand-50', text: 'text-charcoal-500', border: 'border-sand-300',
    hex: '#d4c5b0',
    description: 'Registered but never placed an order',
    action: 'First-purchase incentive',
  },
}

// 1–5 quintile score. higherIsBetter=true → high value → high score. Still used for
// the R/F/M score pips and the R×F heatmap axes — purely descriptive now, no longer
// used to decide which segment a customer belongs to (see STAGE_TO_SEGMENT below).
function quintile(value: number, all: number[], higherIsBetter: boolean): number {
  if (all.length <= 1) return 3
  const min = Math.min(...all)
  const max = Math.max(...all)
  if (min === max) return 3
  const rank = all.filter((v) => v < value).length
  const score = Math.min(5, Math.floor((rank / all.length) * 5) + 1)
  return higherIsBetter ? score : 6 - score
}

// Single source of truth for WHICH segment a customer falls into: the shared
// lifecycle classifier (src/lib/segmentation.ts), relabeled for this dashboard.
// Replaces the old cellSegment(r, f) — a quintile-ranked R/F cell lookup that could
// (and did) disagree with the lifecycle tags shown everywhere else in the app for
// the same customer, since quintiles re-rank against whoever else is a customer
// right now rather than using fixed thresholds. rfm.ts no longer defines any
// classification thresholds of its own — segmentation.ts is the only place that does.
export const STAGE_TO_SEGMENT: Record<LifecycleStage, RFMSegment> = {
  'Never Purchased': 'Never Purchased',
  New: 'Needs Attention',       // '1-order' tag
  Active: 'Potential Loyalists',
  Winback: 'At Risk',
  Loyal: 'Loyal',
  VIP: 'Champions',
  'At Risk': 'At Risk',
  Lapsed: 'Needs Attention',
  Lost: 'Lost',
}

// Wraps STAGE_TO_SEGMENT for the tag sync engine (src/lib/tag-sync.ts) — same
// reasoning as computeRFM below: stage IS the segment classifier, so this isn't a
// second scoring model, just a named entry point callable with just a stage. Returns
// null for 'Never Purchased' — RFM has no recency/frequency/monetary to score for a
// customer with zero orders, so no rfm:* tag should be written for them.
export function computeRfmTier(stage: LifecycleStage): RFMSegment | null {
  if (stage === 'Never Purchased') return null
  return STAGE_TO_SEGMENT[stage]
}

export function computeRFM(customers: EnrichedCustomer[]): ScoredCustomer[] {
  const MS = 86_400_000
  const now = Date.now()
  const recencyOf = (c: EnrichedCustomer) =>
    c.lastOrderDate ? (now - new Date(c.lastOrderDate).getTime()) / MS : 99_999

  const buyers = customers.filter((c) => c.orders_count > 0)
  const allR = buyers.map(recencyOf)
  const allF = buyers.map((c) => c.orders_count)
  const allM = buyers.map((c) => parseFloat(c.total_spent))

  return customers.map((c) => {
    const stage = classifyCustomerStage({
      ordersCount: c.orders_count,
      lastOrderDate: c.lastOrderDate ? new Date(c.lastOrderDate) : null,
      emailMarketingConsentState: c.email_marketing_consent?.state,
    })
    const segment = STAGE_TO_SEGMENT[stage]

    if (c.orders_count === 0) {
      return { ...c, rfm: { r: 1, f: 1, m: 1 }, segment }
    }
    const r = quintile(recencyOf(c), allR, false) // fewer days since order = better recency
    const f = quintile(c.orders_count, allF, true)
    const m = quintile(parseFloat(c.total_spent), allM, true)
    return { ...c, rfm: { r, f, m }, segment }
  })
}

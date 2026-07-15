import type { EnrichedCustomer } from '@/types'
import { computeRFM, type ScoredCustomer } from './rfm'

export type JourneyStage = 'Lead' | 'New' | 'Active' | 'Loyal' | 'VIP' | 'At Risk' | 'Lapsed' | 'Lost'

export const JOURNEY_STAGE_ORDER: JourneyStage[] = [
  'Lead', 'New', 'Active', 'Loyal', 'VIP', 'At Risk', 'Lapsed', 'Lost',
]

export const JOURNEY_STAGE_META: Record<JourneyStage, { bg: string; text: string; border: string }> = {
  'Lead':     { bg: 'bg-sand-200',   text: 'text-charcoal-700', border: 'border-sand-300' },
  'New':      { bg: 'bg-violet-100', text: 'text-violet-700',   border: 'border-violet-200' },
  'Active':   { bg: 'bg-violet-100', text: 'text-violet-700',   border: 'border-violet-200' },
  'Loyal':    { bg: 'bg-teal-100',   text: 'text-teal-700',     border: 'border-teal-200' },
  'VIP':      { bg: 'bg-teal-100',   text: 'text-teal-700',     border: 'border-teal-200' },
  'At Risk':  { bg: 'bg-amber-100',  text: 'text-amber-700',    border: 'border-amber-200' },
  'Lapsed':   { bg: 'bg-red-100',    text: 'text-red-700',      border: 'border-red-200' },
  'Lost':     { bg: 'bg-red-100',    text: 'text-red-700',      border: 'border-red-200' },
}

export interface JourneyAutomation {
  id: string
  stage: JourneyStage
  name: string
  description: string
  active: boolean
}

export const JOURNEY_AUTOMATIONS: JourneyAutomation[] = [
  { id: 'welcome-series',        stage: 'Lead',     name: 'Welcome series',         description: 'Multi-email intro sequence for new subscribers',            active: true },
  { id: 'first-purchase-offer',  stage: 'Lead',     name: 'First purchase offer',    description: "Discount nudge for leads who haven't ordered yet",          active: true },
  { id: 'referral-follow-up',    stage: 'Lead',     name: 'Referral follow-up',      description: 'Invites leads referred by existing customers to buy',       active: false },
  { id: 'event-follow-up',       stage: 'Lead',     name: 'Event follow-up',         description: 'Follows up with leads captured at a pop-up or event',       active: false },

  { id: 'post-purchase',         stage: 'New',      name: 'Post-purchase',           description: 'Order confirmation and care info after a first purchase',   active: true },
  { id: 'review-request',        stage: 'New',      name: 'Review request',          description: 'Asks new customers to review their first order',            active: true },
  { id: 'second-purchase-nudge', stage: 'New',      name: 'Second purchase nudge',   description: 'Encourages a second order with a tailored recommendation',  active: false },

  { id: 'cross-sell-campaign',   stage: 'Active',   name: 'Cross-sell campaign',     description: 'Recommends complementary products from past purchases',    active: true },
  { id: 'anniversary-flow',      stage: 'Active',   name: 'Anniversary flow',        description: 'Marks the first-purchase anniversary with an offer',        active: true },
  { id: 'vip-upgrade-prompt',    stage: 'Active',   name: 'VIP upgrade prompt',      description: 'Highlights VIP perks to push toward the next tier',         active: false },

  { id: 'community-invite',      stage: 'Loyal',    name: 'Community invite',        description: 'Invites loyal customers into a community/loyalty programme', active: true },
  { id: 'referral-program',      stage: 'Loyal',    name: 'Referral program',        description: 'Rewards loyal customers for referring friends',             active: false },
  { id: 'new-launch-preview',    stage: 'Loyal',    name: 'New launch preview',      description: 'Early visibility into upcoming launches',                   active: false },

  { id: 'early-access',          stage: 'VIP',      name: 'Early access',            description: 'Early access to new drops and sales',                       active: true },
  { id: 'personal-thank-you',    stage: 'VIP',      name: 'Personal thank you',      description: 'Personal thank-you note/gift for top spenders',             active: false },
  { id: 'ambassador-invite',     stage: 'VIP',      name: 'Ambassador invite',       description: 'Invites VIPs into an ambassador/affiliate programme',       active: false },

  { id: 'winback-day-60',        stage: 'At Risk',  name: 'Winback day 60',          description: 'First win-back email, sent 60 days after last order',       active: true },
  { id: 'winback-day-75',        stage: 'At Risk',  name: 'Winback day 75',          description: 'Follow-up win-back with a stronger incentive at day 75',    active: true },
  { id: 'last-chance-day-90',    stage: 'At Risk',  name: 'Last chance day 90',      description: 'Final win-back attempt with a steep discount at day 90',    active: false },

  { id: 'reactivation-sequence', stage: 'Lapsed',   name: 'Reactivation sequence',   description: 'Multi-touch sequence to bring lapsed customers back',       active: true },
  { id: 'new-collection-alert',  stage: 'Lapsed',   name: 'New collection alert',    description: 'Notifies lapsed customers about a new collection',          active: false },

  { id: 'final-offer',           stage: 'Lost',     name: 'Final offer',             description: 'Last-ditch discount before pausing active marketing',       active: false },
  { id: 'sunset-flow',           stage: 'Lost',     name: 'Sunset flow',             description: 'Reduces frequency and eventually sunsets inactive contacts', active: true },
]

// Illustrative only — Lela doesn't track lead acquisition source, so this is
// static/mocked. Shown in the Lead column labeled as illustrative, not live data.
export const LEAD_SOURCE_BREAKDOWN: { source: string; pct: number }[] = [
  { source: 'Instagram', pct: 38 },
  { source: 'Referral', pct: 24 },
  { source: 'Google', pct: 19 },
  { source: 'Email popup', pct: 12 },
  { source: 'Other', pct: 7 },
]

// Generic destinations — Omnisend has no way to deep-link to a specific automation
// or pre-select a segment when creating a campaign via URL, so these point at the
// relevant dashboard section instead. Best-effort guess at Omnisend's app routes;
// verify against a live login and adjust if the path has changed.
export const OMNISEND_AUTOMATIONS_URL = 'https://app.omnisend.com/#/automation'
export const OMNISEND_CAMPAIGNS_URL = 'https://app.omnisend.com/#/campaigns/create'

// Tunable thresholds for the lifecycle waterfall below — adjust here without
// touching call sites.
const LAPSED_DAYS = 180
const LOST_DAYS = 365
const AT_RISK_DAYS = 90
const VIP_MIN_SPEND_QUINTILE = 4 // top two spend quintiles (4 or 5)

function daysSinceLastOrder(c: EnrichedCustomer): number {
  if (!c.lastOrderDate) return Infinity
  return (Date.now() - new Date(c.lastOrderDate).getTime()) / 86_400_000
}

// Classifies a customer who has purchased at least once, given their RFM score
// (quintiles are only meaningful when computed across the full buyer pool —
// see computeRFM — so this takes an already-scored customer rather than
// re-deriving quintiles for a single record). 'Lead' isn't produced here —
// see computeJourneyCounts, which derives it separately from the gap between
// total Omnisend contacts and purchasing customers.
export function classifyJourneyStage(scored: ScoredCustomer): Exclude<JourneyStage, 'Lead'> {
  const days = daysSinceLastOrder(scored)
  if (days > LOST_DAYS) return 'Lost'
  if (days > LAPSED_DAYS) return 'Lapsed'
  if (days > AT_RISK_DAYS) return 'At Risk'
  if (scored.computedTags.includes('VIP') && scored.rfm.m >= VIP_MIN_SPEND_QUINTILE) return 'VIP'
  if (scored.segment === 'Champions' || scored.segment === 'Loyal') return 'Loyal'
  if (scored.orders_count >= 2) return 'Active'
  return 'New'
}

export function computeJourneyCounts(
  customers: EnrichedCustomer[],
  omnisendContactCount: number
): Record<JourneyStage, number> {
  const buyers = customers.filter((c) => c.orders_count > 0)
  const scored = computeRFM(buyers) // ranks quintiles across the same buyer pool once, instead of per-customer

  const counts: Record<JourneyStage, number> = {
    Lead: 0, New: 0, Active: 0, Loyal: 0, VIP: 0, 'At Risk': 0, Lapsed: 0, Lost: 0,
  }

  for (const c of scored) counts[classifyJourneyStage(c)]++

  // Approximation: doesn't match individual Omnisend contacts against Shopify
  // emails, just diffs the two totals. Unverified against a live account's
  // exact contact/customer overlap — iterate here if it reads oddly.
  counts.Lead = Math.max(0, omnisendContactCount - buyers.length)

  return counts
}

// Groups customers who have purchased at least once by journey stage — used by
// the "Create" flow to know which customers/emails belong to a given stage.
export function groupCustomersByStage(customers: EnrichedCustomer[]): Record<Exclude<JourneyStage, 'Lead'>, EnrichedCustomer[]> {
  const buyers = customers.filter((c) => c.orders_count > 0)
  const scored = computeRFM(buyers)

  const groups: Record<Exclude<JourneyStage, 'Lead'>, EnrichedCustomer[]> = {
    New: [], Active: [], Loyal: [], VIP: [], 'At Risk': [], Lapsed: [], Lost: [],
  }
  for (const c of scored) groups[classifyJourneyStage(c)].push(c)
  return groups
}

import type { EnrichedCustomer } from '@/types'
import {
  classifyCustomerStage,
  hasRecentAbandonedCheckout,
  LIFECYCLE_STAGE_META,
  STAGE_TRANSITION_RULES as LIFECYCLE_STAGE_TRANSITION_RULES,
  type LifecycleStage,
} from './segmentation'

// 'Pre-Purchase' and 'Lead' aren't LifecycleStage values — they're Journey-only
// aggregate/funnel concepts (see computeJourneyCounts) that can't apply to a
// Customers-tab row, since every row there is already a real Shopify customer.
// Every other stage here is a LifecycleStage 1:1 — same classifier, same
// thresholds, same source of truth as the Customers tab (src/lib/segmentation.ts).
export type JourneyStage = 'Pre-Purchase' | 'Lead' | Exclude<LifecycleStage, 'Never Purchased'>

export const JOURNEY_STAGE_ORDER: JourneyStage[] = [
  'Pre-Purchase', 'Lead', 'New', 'Active', 'Winback', 'Loyal', 'VIP', 'At Risk', 'Lapsed', 'Lost',
]

export const JOURNEY_STAGE_META: Record<JourneyStage, { bg: string; text: string; border: string }> = {
  'Pre-Purchase': { bg: 'bg-indigo-100', text: 'text-indigo-700',   border: 'border-indigo-200' },
  Lead:           { bg: 'bg-sand-200',   text: 'text-charcoal-700', border: 'border-sand-300' },
  New:            LIFECYCLE_STAGE_META.New,
  Active:         LIFECYCLE_STAGE_META.Active,
  Winback:        LIFECYCLE_STAGE_META.Winback,
  Loyal:          LIFECYCLE_STAGE_META.Loyal,
  VIP:            LIFECYCLE_STAGE_META.VIP,
  'At Risk':      LIFECYCLE_STAGE_META['At Risk'],
  Lapsed:         LIFECYCLE_STAGE_META.Lapsed,
  Lost:           LIFECYCLE_STAGE_META.Lost,
}

export type Channel = 'Email' | 'SMS' | 'Email + SMS'

export interface JourneyAutomation {
  id: string
  stage: JourneyStage
  name: string
  description: string
  active: boolean
  channel: Channel
  priority?: boolean
  performance?: { revenuePerRecipient: number } | null
}

// revenuePerRecipient below is a stub. Omnisend has no automations/flows-performance
// endpoint wired into this app yet (src/lib/omnisend.ts only has /campaigns, /segments,
// /contacts) and Klaviyo isn't part of Lela's stack at all — replace with a real query
// once one of those exists. Flagged in the UI too (see the tooltip on AutomationCard's
// performance line in CustomerJourney.tsx), not just here.
export const JOURNEY_AUTOMATIONS: JourneyAutomation[] = [
  { id: 'cart-abandonment',      stage: 'Pre-Purchase', name: 'Cart Abandonment',       description: "Triggers when a customer adds to cart but doesn't complete checkout within a few hours", active: false, channel: 'Email' },
  { id: 'browse-abandonment',    stage: 'Pre-Purchase', name: 'Browse Abandonment',     description: "Triggers when a customer views products/collections but doesn't add to cart within a session", active: false, channel: 'Email' },

  { id: 'welcome-series',        stage: 'Lead',     name: 'Welcome series',         description: 'Multi-email intro sequence for new subscribers',            active: true,  channel: 'Email', performance: { revenuePerRecipient: 1.85 } },
  { id: 'first-purchase-offer',  stage: 'Lead',     name: 'First purchase offer',    description: "Discount nudge for leads who haven't ordered yet",          active: true,  channel: 'Email', performance: { revenuePerRecipient: 2.40 } },
  { id: 'referral-follow-up',    stage: 'Lead',     name: 'Referral follow-up',      description: 'Invites leads referred by existing customers to buy',       active: false, channel: 'Email' },
  { id: 'event-follow-up',       stage: 'Lead',     name: 'Event follow-up',         description: 'Follows up with leads captured at a pop-up or event',       active: false, channel: 'Email' },

  { id: 'post-purchase',         stage: 'New',      name: 'Post-purchase',           description: 'Order confirmation and care info after a first purchase',   active: true,  channel: 'Email', performance: { revenuePerRecipient: 1.20 } },
  { id: 'review-request',        stage: 'New',      name: 'Review request',          description: 'Asks new customers to review their first order',            active: true,  channel: 'Email', performance: { revenuePerRecipient: 0.65 } },
  { id: 'second-purchase-nudge', stage: 'New',      name: 'Second purchase nudge',   description: 'Encourages a second order with a tailored recommendation',  active: false, channel: 'Email' },
  { id: 'back-in-stock-new',     stage: 'New',      name: 'Back-in-Stock Alert',     description: 'Notifies a customer when a product they wanted is restocked', active: false, channel: 'Email' },
  { id: 'price-drop-new',        stage: 'New',      name: 'Price Drop Alert',        description: 'Notifies a customer when a product they viewed drops in price', active: false, channel: 'Email' },
  { id: 'post-purchase-education', stage: 'New',    name: 'Post-Purchase Education', description: 'How-to-wear / care instructions, separate from the review request', active: false, channel: 'Email' },

  { id: 'cross-sell-campaign',   stage: 'Active',   name: 'Cross-sell campaign',     description: 'Recommends complementary products from past purchases',    active: true,  channel: 'Email', performance: { revenuePerRecipient: 3.10 } },
  { id: 'anniversary-flow',      stage: 'Active',   name: 'Anniversary flow',        description: 'Marks the first-purchase anniversary with an offer',        active: true,  channel: 'Email', performance: { revenuePerRecipient: 2.75 } },
  { id: 'back-in-stock-active',  stage: 'Active',   name: 'Back-in-Stock Alert',     description: 'Notifies a customer when a product they wanted is restocked', active: false, channel: 'Email' },
  { id: 'price-drop-active',     stage: 'Active',   name: 'Price Drop Alert',        description: 'Notifies a customer when a product they viewed drops in price', active: false, channel: 'Email' },

  { id: 'winback-day-60',        stage: 'Winback',  name: 'Winback day 60',          description: 'First win-back email, sent 60 days after a customer’s only order', active: true,  channel: 'Email', performance: { revenuePerRecipient: 1.95 } },
  { id: 'winback-day-75',        stage: 'Winback',  name: 'Winback day 75',          description: 'Follow-up win-back with a stronger incentive at day 75',    active: true,  channel: 'Email', performance: { revenuePerRecipient: 1.35 } },

  { id: 'vip-upgrade-prompt',    stage: 'Loyal',    name: 'VIP upgrade prompt',      description: 'Highlights VIP perks to push toward the next tier',         active: false, channel: 'Email' },
  { id: 'community-invite',      stage: 'Loyal',    name: 'Community invite',        description: 'Invites loyal customers into a community/loyalty programme', active: true,  channel: 'Email', performance: { revenuePerRecipient: 1.40 } },
  { id: 'referral-program',      stage: 'Loyal',    name: 'Referral program',        description: 'Rewards loyal customers for referring friends',             active: false, channel: 'Email' },
  { id: 'new-launch-preview',    stage: 'Loyal',    name: 'New launch preview',      description: 'Early visibility into upcoming launches',                   active: false, channel: 'Email' },
  { id: 'replenishment-loyal',   stage: 'Loyal',    name: 'Replenishment Reminder',  description: 'Reminds loyal customers to reorder consumable products, where applicable', active: false, channel: 'Email' },

  { id: 'early-access',          stage: 'VIP',      name: 'Early access',            description: 'Early access to new drops and sales',                       active: true,  channel: 'Email', performance: { revenuePerRecipient: 4.20 } },
  { id: 'personal-thank-you',    stage: 'VIP',      name: 'Personal thank you',      description: 'Personal thank-you note/gift for top spenders',             active: true,  channel: 'Email', priority: true, performance: { revenuePerRecipient: 3.60 } },
  { id: 'ambassador-invite',     stage: 'VIP',      name: 'Ambassador invite',       description: 'Invites VIPs into an ambassador/affiliate programme',       active: true,  channel: 'Email', priority: true, performance: { revenuePerRecipient: 2.90 } },
  { id: 'replenishment-vip',     stage: 'VIP',      name: 'Replenishment Reminder',  description: 'Reminds VIP customers to reorder consumable products, where applicable', active: false, channel: 'Email' },

  { id: 're-engagement-nudge',   stage: 'At Risk',  name: 'Re-engagement Nudge',     description: 'Light-touch check-in for repeat customers whose pace has slowed, before they lapse', active: false, channel: 'Email' },
  { id: 'last-chance-day-90',    stage: 'Lapsed',   name: 'Last chance day 90',      description: 'Final win-back attempt with a steep discount at day 90',    active: false, channel: 'Email' },

  { id: 'reactivation-sequence', stage: 'Lapsed',   name: 'Reactivation sequence',   description: 'Multi-touch sequence to bring lapsed customers back',       active: true,  channel: 'Email', performance: { revenuePerRecipient: 1.10 } },
  { id: 'new-collection-alert',  stage: 'Lapsed',   name: 'New collection alert',    description: 'Notifies lapsed customers about a new collection',          active: false, channel: 'Email' },

  { id: 'final-offer',           stage: 'Lost',     name: 'Final offer',             description: 'Last-ditch discount before pausing active marketing',       active: false, channel: 'Email' },
  { id: 'sunset-flow',           stage: 'Lost',     name: 'Sunset flow',             description: 'Reduces frequency and eventually sunsets inactive contacts', active: true,  channel: 'Email', performance: { revenuePerRecipient: 0.45 } },
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

// Confirmed against a live login (2026-07-22) — unlike the generic list-page link
// above, this opens one specific workflow. Only usable once the automation's real
// Omnisend id has been resolved (see CustomerJourney.tsx); falls back to
// OMNISEND_AUTOMATIONS_URL otherwise.
export function omnisendAutomationEditUrl(automationId: string): string {
  return `https://app.omnisend.com/automation/edit/${automationId}`
}

// Maps a JourneyAutomation's id to the exact name of its real Omnisend automation,
// once one exists — e.g. the real workflow is just named "Welcome" in Omnisend,
// not "Welcome series". Deliberately explicit and hand-maintained rather than
// fuzzy/substring name-matching: guessing at a match risks linking to the wrong
// workflow, where an honest fallback to the generic automations list does not.
// Add an entry here whenever a new automation goes live in Omnisend.
export const JOURNEY_AUTOMATION_OMNISEND_NAMES: Partial<Record<string, string>> = {
  'welcome-series': 'Welcome',
}

// Plain-language transition rules — 'New' through 'Lost' are pulled directly from
// the shared classifier (src/lib/segmentation.ts) so this copy can't drift out of
// sync with the real thresholds; 'Pre-Purchase'/'Lead' get their own text since
// they're Journey-only funnel concepts, not LifecycleStage values.
export const STAGE_TRANSITION_RULES: Record<JourneyStage, string> = {
  'Pre-Purchase': 'Added to cart or browsed, but no completed order yet',
  Lead: 'Known Omnisend contact with zero completed Shopify orders',
  New: LIFECYCLE_STAGE_TRANSITION_RULES.New,
  Active: LIFECYCLE_STAGE_TRANSITION_RULES.Active,
  Winback: LIFECYCLE_STAGE_TRANSITION_RULES.Winback,
  Loyal: LIFECYCLE_STAGE_TRANSITION_RULES.Loyal,
  VIP: LIFECYCLE_STAGE_TRANSITION_RULES.VIP,
  'At Risk': LIFECYCLE_STAGE_TRANSITION_RULES['At Risk'],
  Lapsed: LIFECYCLE_STAGE_TRANSITION_RULES.Lapsed,
  Lost: LIFECYCLE_STAGE_TRANSITION_RULES.Lost,
}

// Classifies a customer who has purchased at least once — callers pre-filter to
// orders_count > 0 (see computeJourneyCounts/groupCustomersByStage below), so
// classifyCustomerStage never actually returns 'Never Purchased' here, matching
// this function's contract. 'Lead' and 'Pre-Purchase' aren't produced here — see
// computeJourneyCounts, which derives Lead from the gap between total Omnisend
// contacts and purchasing customers, and Pre-Purchase from real Shopify
// abandoned-checkout data.
export function classifyJourneyStage(customer: EnrichedCustomer): Exclude<JourneyStage, 'Lead' | 'Pre-Purchase'> {
  const stage = classifyCustomerStage({
    ordersCount: customer.orders_count,
    lastOrderDate: customer.lastOrderDate ? new Date(customer.lastOrderDate) : null,
    emailMarketingConsentState: customer.email_marketing_consent?.state,
  })
  return stage as Exclude<LifecycleStage, 'Never Purchased'>
}

export function computeJourneyCounts(
  customers: EnrichedCustomer[],
  omnisendContactCount: number
): Record<JourneyStage, number> {
  const buyers = customers.filter((c) => c.orders_count > 0)

  const counts: Record<JourneyStage, number> = {
    'Pre-Purchase': 0, Lead: 0, New: 0, Active: 0, Winback: 0, Loyal: 0, VIP: 0, 'At Risk': 0, Lapsed: 0, Lost: 0,
  }

  for (const c of buyers) counts[classifyJourneyStage(c)]++

  // Approximation: doesn't match individual Omnisend contacts against Shopify
  // emails, just diffs the two totals. Unverified against a live account's
  // exact contact/customer overlap — iterate here if it reads oddly.
  counts.Lead = Math.max(0, omnisendContactCount - buyers.length)

  // Real data, using the same 14-day recency window as the Abandoned Checkout tag
  // (src/lib/segmentation.ts) — so this and the Customers-tab badge always agree.
  counts['Pre-Purchase'] = customers.filter((c) => hasRecentAbandonedCheckout(c.abandonedCheckouts)).length

  return counts
}

// Groups customers who have purchased at least once by journey stage — used by
// the "Create" flow to know which customers/emails belong to a given stage.
export function groupCustomersByStage(customers: EnrichedCustomer[]): Record<Exclude<JourneyStage, 'Lead' | 'Pre-Purchase'>, EnrichedCustomer[]> {
  const buyers = customers.filter((c) => c.orders_count > 0)

  const groups: Record<Exclude<JourneyStage, 'Lead' | 'Pre-Purchase'>, EnrichedCustomer[]> = {
    New: [], Active: [], Winback: [], Loyal: [], VIP: [], 'At Risk': [], Lapsed: [], Lost: [],
  }
  for (const c of buyers) groups[classifyJourneyStage(c)].push(c)
  return groups
}

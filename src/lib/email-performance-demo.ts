// Hand-authored demo dataset for the Email Performance tab. The real Omnisend
// account has negligible send volume, so every number here is illustrative
// rather than fetched — but it's fixed, not randomized, so the "one flow
// underperforming, deliverability trending down" story stays stable across
// reloads instead of reshuffling on every page load.
//
// This is the ONLY place these numbers live — every Email Performance
// component and the Customer Journey attribution card both read from here,
// so the story can't drift into two disagreeing versions of itself.
import type { LifecycleStage } from './segmentation'
import { LIFECYCLE_STAGE_META } from './segmentation'
import type { JourneyStage } from './journey'

// ─── Flows ──────────────────────────────────────────────────────────────────

export interface DemoFlowEmailStep {
  name: string
  entered: number
  opened: number
  clicked: number
  converted: number
  revenue: number
}

export interface DemoFlow {
  id: string
  name: string
  stage: JourneyStage
  emails: DemoFlowEmailStep[]
  diagnosticNote?: string
}

// Names deliberately echo the `active: true` entries in src/lib/journey.ts's
// JOURNEY_AUTOMATIONS, so the two tabs read as one system — the figures here
// are independently modeled, not derived from journey.ts's own stub numbers.
export const DEMO_FLOWS: DemoFlow[] = [
  {
    id: 'welcome-series',
    name: 'Welcome Series',
    stage: 'Lead',
    emails: [
      { name: 'Welcome + 10% off', entered: 1180, opened: 672, clicked: 218, converted: 71, revenue: 1775 },
      { name: 'Shop our bestsellers', entered: 1100, opened: 505, clicked: 128, converted: 33, revenue: 825 },
      { name: 'Your code expires tonight', entered: 1060, opened: 398, clicked: 145, converted: 54, revenue: 1350 },
    ],
  },
  {
    id: 'post-purchase-care',
    name: 'Post-Purchase Care',
    stage: 'New',
    emails: [
      { name: 'Care guide & what to expect', entered: 2050, opened: 1168, clicked: 287, converted: 0, revenue: 0 },
      { name: 'Loved it? Leave a review + 10% off', entered: 2050, opened: 902, clicked: 241, converted: 96, revenue: 2304 },
    ],
  },
  {
    id: 'cross-sell-campaign',
    name: 'Cross-Sell Campaign',
    stage: 'Active',
    emails: [
      { name: 'Complete the set', entered: 640, opened: 358, clicked: 121, converted: 52, revenue: 2080 },
    ],
  },
  {
    id: 'winback-sequence',
    name: 'Winback Sequence',
    stage: 'Winback',
    emails: [
      { name: "We miss you — 15% back (day 60)", entered: 890, opened: 285, clicked: 42, converted: 9, revenue: 225 },
      { name: 'Last call before we let go (day 75)', entered: 860, opened: 189, clicked: 31, converted: 7, revenue: 175 },
    ],
    diagnosticNote:
      "Open rate drops from 32% on email 1 to 22% on email 2 — a steeper step-down than any other flow. Email 1 alone underperforms Welcome Series' first email by roughly half.",
  },
  {
    id: 'reactivation-sequence',
    name: 'Reactivation Sequence',
    stage: 'Lapsed',
    emails: [
      { name: "It's been a while — 15% on us", entered: 510, opened: 214, clicked: 58, converted: 19, revenue: 760 },
      { name: "New arrivals you haven't seen", entered: 491, opened: 158, clicked: 39, converted: 11, revenue: 440 },
    ],
  },
  {
    id: 'early-access',
    name: 'Early Access',
    stage: 'VIP',
    emails: [
      { name: '48-hour early access, just for you', entered: 145, opened: 118, clicked: 71, converted: 34, revenue: 3060 },
    ],
  },
]

export function flowAudience(flow: DemoFlow): number {
  return flow.emails[0]?.entered ?? 0
}
export function flowConverted(flow: DemoFlow): number {
  return flow.emails.reduce((sum, e) => sum + e.converted, 0)
}
export function flowRevenue(flow: DemoFlow): number {
  return flow.emails.reduce((sum, e) => sum + e.revenue, 0)
}
export function flowConversionRate(flow: DemoFlow): number {
  const audience = flowAudience(flow)
  return audience > 0 ? flowConverted(flow) / audience : 0
}
export function flowRevenuePerRecipient(flow: DemoFlow): number {
  const audience = flowAudience(flow)
  return audience > 0 ? flowRevenue(flow) / audience : 0
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

export interface DemoCampaign {
  id: string
  name: string
  sentAt: string // ISO date
  totalSent: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  unsubscribed: number
  revenue: number
}

// Biweekly, ending 2026-07-18. Bounce rate climbs 0.40% -> 0.68% across the
// period (mirrors DEMO_DELIVERABILITY_TREND below); "Mid-Season Markdown" is
// the deliberate unsubscribe-rate blip (discount-heavy send).
export const DEMO_CAMPAIGNS: DemoCampaign[] = [
  { id: 'c1', name: 'April Restock Alert',           sentAt: '2026-04-11', totalSent: 2970, opened: 1054, clicked: 178, bounced: 12, complained: 1, unsubscribed: 9,  revenue: 1380 },
  { id: 'c2', name: 'Spring Capsule Launch',          sentAt: '2026-04-25', totalSent: 3020, opened: 1102, clicked: 201, bounced: 13, complained: 1, unsubscribed: 8,  revenue: 2140 },
  { id: 'c3', name: "Mother's Day Gift Edit",         sentAt: '2026-05-09', totalSent: 3065, opened: 1180, clicked: 224, bounced: 15, complained: 2, unsubscribed: 10, revenue: 2510 },
  { id: 'c4', name: 'Mid-Season Markdown',            sentAt: '2026-05-23', totalSent: 3090, opened: 1250, clicked: 265, bounced: 16, complained: 3, unsubscribed: 21, revenue: 1980 },
  { id: 'c5', name: 'New Arrivals: Summer Edit',      sentAt: '2026-06-06', totalSent: 3120, opened: 1095, clicked: 187, bounced: 18, complained: 2, unsubscribed: 11, revenue: 1760 },
  { id: 'c6', name: 'Customer Favorites Restocked',   sentAt: '2026-06-20', totalSent: 3150, opened: 1071, clicked: 179, bounced: 20, complained: 2, unsubscribed: 12, revenue: 1620 },
  { id: 'c7', name: 'Weekend Flash Sale',              sentAt: '2026-07-04', totalSent: 3195, opened: 1138, clicked: 232, bounced: 21, complained: 3, unsubscribed: 13, revenue: 2260 },
  { id: 'c8', name: 'New Drop Preview',                sentAt: '2026-07-18', totalSent: 3240, opened: 1096, clicked: 195, bounced: 22, complained: 2, unsubscribed: 12, revenue: 1890 },
]

// Flat, explicitly illustrative — not a Lela-specific figure — used only to
// give unsubscribe counts a tangible "cost" framing.
export const ESTIMATED_SUBSCRIBER_VALUE_EUR = 45

export function campaignRate(campaign: DemoCampaign, key: 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed'): number {
  return campaign.totalSent > 0 ? campaign[key] / campaign.totalSent : 0
}
export function unsubscribeCost(campaign: DemoCampaign): number {
  return campaign.unsubscribed * ESTIMATED_SUBSCRIBER_VALUE_EUR
}

// ─── Deliverability trend ───────────────────────────────────────────────────

export interface DemoDeliverabilityPoint {
  date: string // ISO date, weekly
  bounceRate: number
  complaintRate: number
  unsubscribeRate: number
}

// 12 weekly points, 2026-05-04 -> 2026-07-20. All three drift the wrong
// direction — the deliverability half of the "slightly imperfect" story.
export const DEMO_DELIVERABILITY_TREND: DemoDeliverabilityPoint[] = [
  { date: '2026-05-04', bounceRate: 0.0038, complaintRate: 0.0002, unsubscribeRate: 0.0028 },
  { date: '2026-05-11', bounceRate: 0.0041, complaintRate: 0.0002, unsubscribeRate: 0.0029 },
  { date: '2026-05-18', bounceRate: 0.0043, complaintRate: 0.0003, unsubscribeRate: 0.0031 },
  { date: '2026-05-25', bounceRate: 0.0047, complaintRate: 0.0003, unsubscribeRate: 0.0033 },
  { date: '2026-06-01', bounceRate: 0.0050, complaintRate: 0.0003, unsubscribeRate: 0.0034 },
  { date: '2026-06-08', bounceRate: 0.0053, complaintRate: 0.0004, unsubscribeRate: 0.0036 },
  { date: '2026-06-15', bounceRate: 0.0056, complaintRate: 0.0004, unsubscribeRate: 0.0037 },
  { date: '2026-06-22', bounceRate: 0.0060, complaintRate: 0.0005, unsubscribeRate: 0.0039 },
  { date: '2026-06-29', bounceRate: 0.0063, complaintRate: 0.0005, unsubscribeRate: 0.0040 },
  { date: '2026-07-06', bounceRate: 0.0067, complaintRate: 0.0006, unsubscribeRate: 0.0042 },
  { date: '2026-07-13', bounceRate: 0.0070, complaintRate: 0.0006, unsubscribeRate: 0.0043 },
  { date: '2026-07-20', bounceRate: 0.0074, complaintRate: 0.0007, unsubscribeRate: 0.0044 },
]

// ─── Engagement recency ("Email Ghost") ─────────────────────────────────────
//
// Scoped entirely to this demo dataset — deliberately. "Email Ghost" used to
// be UI copy describing an email-open-based rule that was never actually
// wired up (removed in commit 3ae467e because it didn't match anything the
// app computed). There's still no per-contact Omnisend engagement data
// anywhere in this app, so this stays an Email Performance-only illustration
// rather than a tag written onto real Customer Intelligence records. Bucket
// colors reuse segmentation.ts's LIFECYCLE_STAGE_META classes so the two tabs
// read as the same visual language without sharing real customer data.

export type EngagementRecencyBucket = 'Fresh' | 'Fading' | 'Ghosting' | 'Ghost'

export const EMAIL_ENGAGEMENT_META: Record<EngagementRecencyBucket, { bg: string; text: string; border: string; label: string; window: string }> = {
  Fresh:    { ...LIFECYCLE_STAGE_META.Active,        label: 'Fresh',    window: 'Opened in the last 30 days' },
  Fading:   { ...LIFECYCLE_STAGE_META['At Risk'],    label: 'Fading',   window: 'Last open 31–60 days ago' },
  Ghosting: { ...LIFECYCLE_STAGE_META.Lapsed,        label: 'Ghosting', window: 'Last open 61–90 days ago' },
  Ghost:    { bg: 'bg-charcoal-900', text: 'text-white', border: 'border-charcoal-900', label: 'Ghost', window: 'No open in 90+ days' },
}

export interface DemoRecencyPoint {
  date: string // ISO date, monthly
  opened30: number // % of list opened in last 30 days
  opened60: number
  opened90: number
}

// 6 monthly points, Feb-Jul 2026 — all three soften over time.
export const DEMO_RECENCY_TREND: DemoRecencyPoint[] = [
  { date: '2026-02-01', opened30: 34.2, opened60: 48.5, opened90: 58.0 },
  { date: '2026-03-01', opened30: 33.0, opened60: 47.2, opened90: 57.1 },
  { date: '2026-04-01', opened30: 31.8, opened60: 46.0, opened90: 56.3 },
  { date: '2026-05-01', opened30: 30.5, opened60: 45.1, opened90: 55.4 },
  { date: '2026-06-01', opened30: 29.4, opened60: 44.2, opened90: 54.7 },
  { date: '2026-07-01', opened30: 28.6, opened60: 43.5, opened90: 54.1 },
]

export interface RecencyBucketBreakdown {
  bucket: EngagementRecencyBucket
  pct: number
}

// Derived from the latest recency point, not hardcoded twice.
export function currentRecencyBuckets(): RecencyBucketBreakdown[] {
  const latest = DEMO_RECENCY_TREND[DEMO_RECENCY_TREND.length - 1]
  return [
    { bucket: 'Fresh', pct: latest.opened30 },
    { bucket: 'Fading', pct: latest.opened60 - latest.opened30 },
    { bucket: 'Ghosting', pct: latest.opened90 - latest.opened60 },
    { bucket: 'Ghost', pct: 100 - latest.opened90 },
  ]
}

// ─── Stage-to-flow attribution ──────────────────────────────────────────────

const RISK_STAGES: LifecycleStage[] = ['Winback', 'At Risk', 'Lapsed', 'Lost']
const HEALTHY_STAGES: LifecycleStage[] = ['New', 'Active', 'Loyal', 'VIP']

// Which stage (if any) a recovery flow is credited for, keyed by the "risk"
// stage a customer is moving FROM. `null` means no active flow currently
// targets that stage — an honest gap, not filled in with a fake match. Kept
// deliberately small: only the stages the demo flows above actually target.
const STAGE_RECOVERY_FLOW_MAP: Partial<Record<LifecycleStage, string | null>> = {
  Winback: 'Winback Sequence',
  Lapsed: 'Reactivation Sequence',
  'At Risk': null, // journey.ts's `re-engagement-nudge` automation exists but is inactive
  Lost: null,
}

function isRecovery(oldStage: LifecycleStage, newStage: LifecycleStage): boolean {
  return RISK_STAGES.includes(oldStage) && HEALTHY_STAGES.includes(newStage)
}

// Used both to build the illustrative examples below and, server-side, to
// annotate real StageTransition rows from readStageHistory() once they exist.
export function matchFlowForTransition(oldStage: LifecycleStage | null, newStage: LifecycleStage): string | null {
  if (!oldStage || !isRecovery(oldStage, newStage)) return null
  return STAGE_RECOVERY_FLOW_MAP[oldStage] ?? null
}

export interface StageFlowAttributionExample {
  customerLabel: string
  oldStage: LifecycleStage
  newStage: LifecycleStage
  changedAtLabel: string
  matchedFlow: string | null
  note: string
}

// Illustrative only — no real customer identities. Deliberately includes one
// honest gap (At Risk) rather than making every example look solved.
export const ILLUSTRATIVE_ATTRIBUTION_EXAMPLES: StageFlowAttributionExample[] = [
  {
    customerLabel: 'Customer A',
    oldStage: 'Winback',
    newStage: 'Active',
    changedAtLabel: '2026-06-14',
    matchedFlow: 'Winback Sequence',
    note: 'Placed a second order 9 days after the day-60 email; the day-75 follow-up never went out.',
  },
  {
    customerLabel: 'Customer B',
    oldStage: 'Lapsed',
    newStage: 'Loyal',
    changedAtLabel: '2026-05-30',
    matchedFlow: 'Reactivation Sequence',
    note: 'Converted on email 1 using the 15% code.',
  },
  {
    customerLabel: 'Customer C',
    oldStage: 'At Risk',
    newStage: 'Active',
    changedAtLabel: '2026-07-02',
    matchedFlow: null,
    note: "No active flow currently targets At Risk customers — the Journey tab's re-engagement nudge automation exists but is inactive, so this recovery can't be attributed to anything today.",
  },
]

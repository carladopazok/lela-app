import { omnisendDatedPost, omnisendGet } from '@/lib/omnisend'
import type { CampaignFlowRevenue, OmnisendCampaign } from '@/types'

interface StatisticsRow {
  timestamp: string
  marketingActivityID: string
  marketingActivityType: string
  sent?: number
  clickedUnique?: number
  attributedRevenue?: number
}

interface StatisticsResponse {
  statistics: Array<{ alias: string; rows: StatisticsRow[] }>
}

// Live API constraint (confirmed via a 400 response, not documented upfront):
// daily granularity cannot be used with a date range longer than 60 days.
const MAX_WINDOW_DAYS = 60
const DAY_MS = 86_400_000

function* dateWindows(start: Date, end: Date): Generator<{ from: Date; to: Date }> {
  let windowStart = new Date(start)
  while (windowStart < end) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + (MAX_WINDOW_DAYS - 1) * DAY_MS, end.getTime()))
    yield { from: windowStart, to: windowEnd }
    windowStart = new Date(windowEnd.getTime() + DAY_MS)
  }
}

async function fetchWindowStats(from: Date, to: Date): Promise<StatisticsRow[]> {
  const res = await omnisendDatedPost<StatisticsResponse>('/analytics/statistics', {
    queries: [
      {
        alias: 'campaign_flow_revenue',
        metrics: [{ name: 'sent' }, { name: 'clickedUnique' }, { name: 'attributedRevenue' }],
        dimensions: [
          { name: 'timestamp', granularity: 'day' },
          { name: 'marketingActivityID' },
          { name: 'marketingActivityType' },
        ],
        dateRange: { from: from.toISOString(), to: to.toISOString() },
      },
    ],
  })
  return res.statistics[0]?.rows ?? []
}

/**
 * Best-effort — this depends on Omnisend's Statistics API, which is
 * unverified against this account (see the "dated API" caveat in omnisend.ts).
 * Callers should catch failures and continue without campaign_flow_revenue
 * rather than fail the whole backfill.
 */
export async function buildCampaignFlowRevenue(start: Date, end: Date): Promise<CampaignFlowRevenue[]> {
  const rawRows: StatisticsRow[] = []
  for (const { from, to } of dateWindows(start, end)) {
    rawRows.push(...(await fetchWindowStats(from, to)))
  }

  const nameById = new Map<string, string>()
  try {
    const campaignsRes = await omnisendGet<{ campaign: OmnisendCampaign[] }>('/campaigns', { limit: '250' })
    for (const c of campaignsRes.campaign ?? []) nameById.set(c.campaignID, c.name)
  } catch {
    // best-effort; fall back to raw IDs below
  }

  return rawRows.map((r) => ({
    send_date: r.timestamp.slice(0, 10),
    campaign_or_flow_id: r.marketingActivityID,
    type: (r.marketingActivityType?.toLowerCase().includes('automation') ? 'flow' : 'campaign') as 'campaign' | 'flow',
    name: nameById.get(r.marketingActivityID) ?? r.marketingActivityID,
    attributed_revenue: typeof r.attributedRevenue === 'number' ? r.attributedRevenue : null,
    sent_count: r.sent ?? 0,
    click_count: r.clickedUnique ?? 0,
  }))
}

import { NextResponse } from 'next/server'
import { omnisendAnalyticsReport } from '@/lib/omnisend'

// Real, account-wide weekly deliverability trend — no per-campaign/per-flow
// breakdown available yet (see the comment on omnisendAnalyticsReport), so
// this is the aggregate across every send. Same shape as
// DemoDeliverabilityPoint (date/bounceRate/complaintRate/unsubscribeRate) so
// EmailDeliverability.tsx can render either source with the same code.
export async function GET() {
  try {
    const [report] = await omnisendAnalyticsReport([
      {
        alias: 'deliverability',
        metrics: [{ name: 'failRate' }, { name: 'markedAsSpamRate' }, { name: 'unsubscribeRate' }],
        dateRange: { interval: 'last90Days' },
        dimensions: [{ name: 'timestamp', granularity: 'week' }],
      },
    ])

    const trend = (report?.rows ?? []).map((row) => ({
      date: String(row.timestamp).slice(0, 10),
      bounceRate: Number(row.failRate) || 0,
      complaintRate: Number(row.markedAsSpamRate) || 0,
      unsubscribeRate: Number(row.unsubscribeRate) || 0,
    }))

    return NextResponse.json({ trend })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

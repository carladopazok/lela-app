import { NextResponse } from 'next/server'
import { omnisendGet } from '@/lib/omnisend'
import type { OmnisendCampaign, CampaignRow } from '@/types'

interface OmnisendCampaignsResponse {
  campaign: OmnisendCampaign[]   // Omnisend uses singular "campaign", not "campaigns"
  paging: {
    previous: string | null
    next: string | null
    offset: number
    limit: number
  }
}

export async function GET() {
  try {
    const data = await omnisendGet<OmnisendCampaignsResponse>('/campaigns', {
      limit: '10',
    })

    const rows: CampaignRow[] = (data.campaign ?? []).map((c) => {
      const total = c.sent ?? 0
      const opened = c.opened ?? 0
      const clicked = c.clicked ?? 0

      return {
        id: c.campaignID,
        name: c.name,
        status: c.status,
        sentAt: c.startDate || c.createdAt,
        totalSent: total,
        openRate: total > 0 ? opened / total : null,
        clickRate: total > 0 ? clicked / total : null,
        attributedRevenue: null,  // not available in campaigns list endpoint
        currency: 'USD',
      }
    })

    return NextResponse.json({ campaigns: rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

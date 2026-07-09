import { NextResponse } from 'next/server'
import { readDailyRevenue, readCampaignFlowRevenue, readForecastMeta } from '@/lib/forecast-storage'

export async function GET() {
  return NextResponse.json({
    meta: readForecastMeta(),
    dailyRevenueRows: readDailyRevenue().length,
    campaignFlowRevenueRows: readCampaignFlowRevenue().length,
  })
}

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { fetchOrderHistory, buildDailyRevenue, buildCustomerOrderLedger } from '@/lib/forecast/build-daily-revenue'
import { buildCampaignFlowRevenue } from '@/lib/forecast/build-campaign-flow-revenue'
import {
  writeDailyRevenue,
  writeCampaignFlowRevenue,
  writeCustomerOrders,
  writeForecastMeta,
  readForecastMeta,
} from '@/lib/forecast-storage'

export async function POST() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)

    const orders = await fetchOrderHistory(shopify)
    const dailyRevenue = buildDailyRevenue(orders)
    writeDailyRevenue(dailyRevenue)
    writeCustomerOrders(buildCustomerOrderLedger(orders))

    let campaignFlowRows = 0
    let omnisendError: string | null = null
    try {
      const start = new Date()
      start.setFullYear(start.getFullYear() - 2)
      const campaignFlowRevenue = await buildCampaignFlowRevenue(start, new Date())
      writeCampaignFlowRevenue(campaignFlowRevenue)
      campaignFlowRows = campaignFlowRevenue.length
    } catch (err) {
      omnisendError = err instanceof Error ? err.message : 'Unknown Omnisend error'
      console.error('[forecast/backfill] Omnisend campaign_flow_revenue failed:', omnisendError)
    }

    const now = new Date().toISOString()
    const meta = readForecastMeta()
    writeForecastMeta({
      ...meta,
      lastBackfillAt: now,
      lastRefreshAt: now,
      omnisendAttributionAvailable: omnisendError === null && campaignFlowRows > 0,
    })

    // Acceptance check: trailing-365-day gross_revenue sum should match the
    // Sales Overview computation for the same period (both derive from the
    // same order set, so this should land at ~0 delta modulo rounding).
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 365)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const trailing365Sum = dailyRevenue
      .filter((r) => r.date >= cutoffStr)
      .reduce((sum, r) => sum + r.gross_revenue, 0)

    return NextResponse.json({
      dailyRevenueRows: dailyRevenue.length,
      campaignFlowRevenueRows: campaignFlowRows,
      omnisendError,
      acceptanceCheck: {
        trailing365DayGrossRevenue: Math.round(trailing365Sum * 100) / 100,
        note: 'Compare against /api/shopify/sales-overview?days=365 totalRevenue — should be within rounding.',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[forecast/backfill] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

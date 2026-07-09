import { NextRequest, NextResponse } from 'next/server'
import { readDailyRevenue, readCustomerOrders } from '@/lib/forecast-storage'
import { readDummyDailyRevenue } from '@/lib/dummy-data'
import { fitBaselineModel, baselineForecast } from '@/lib/forecast/baseline-model'
import { fitCohortModel, cohortForecastDaily } from '@/lib/forecast/cohort-model'
import { dateRange, shiftYear } from '@/lib/forecast/date-utils'
import type { DailyRevenue, ForecastPoint } from '@/types'

function mergeDailyRevenue(real: DailyRevenue[], dummy: DailyRevenue[]): DailyRevenue[] {
  const byDate = new Map(real.map((r) => [r.date, { ...r }]))
  for (const d of dummy) {
    const existing = byDate.get(d.date)
    if (!existing) {
      byDate.set(d.date, { ...d })
      continue
    }
    existing.gross_revenue += d.gross_revenue
    existing.net_revenue += d.net_revenue
    existing.order_count += d.order_count
    existing.new_customer_revenue += d.new_customer_revenue
    existing.returning_customer_revenue += d.returning_customer_revenue
    existing.discount_amount += d.discount_amount
    existing.new_customer_count += d.new_customer_count
    existing.returning_customer_count += d.returning_customer_count
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get('start')
  const end = req.nextUrl.searchParams.get('end')
  const model = req.nextUrl.searchParams.get('model') === 'cohort' ? 'cohort' : 'trend'
  const includeDummy = req.nextUrl.searchParams.get('dummy') === '1'

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end query params required (YYYY-MM-DD)' }, { status: 400 })
  }

  const dailyRevenue = includeDummy ? mergeDailyRevenue(readDailyRevenue(), readDummyDailyRevenue()) : readDailyRevenue()
  const actualByDate = new Map(dailyRevenue.map((r) => [r.date, r.gross_revenue]))

  const baselineModel = fitBaselineModel(dailyRevenue)
  const cohortModel = model === 'cohort' ? fitCohortModel(readCustomerOrders(), dailyRevenue) : null

  const points: ForecastPoint[] = dateRange(start, end).map((date) => {
    const forecast =
      cohortModel !== null ? cohortForecastDaily(cohortModel, baselineModel, date) : baselineForecast(baselineModel, date)

    return {
      date,
      actual: actualByDate.get(date) ?? null,
      forecast: Math.round(forecast * 100) / 100,
      priorYear: actualByDate.get(shiftYear(date, -1)) ?? null,
    }
  })

  return NextResponse.json({ points, model })
}

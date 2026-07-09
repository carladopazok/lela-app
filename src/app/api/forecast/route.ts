import { NextRequest, NextResponse } from 'next/server'
import { readDailyRevenue, readCustomerOrders } from '@/lib/forecast-storage'
import { fitBaselineModel, baselineForecast } from '@/lib/forecast/baseline-model'
import { fitCohortModel, cohortForecastDaily } from '@/lib/forecast/cohort-model'
import { dateRange, shiftYear } from '@/lib/forecast/date-utils'
import type { ForecastPoint } from '@/types'

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get('start')
  const end = req.nextUrl.searchParams.get('end')
  const model = req.nextUrl.searchParams.get('model') === 'cohort' ? 'cohort' : 'trend'

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end query params required (YYYY-MM-DD)' }, { status: 400 })
  }

  const dailyRevenue = readDailyRevenue()
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

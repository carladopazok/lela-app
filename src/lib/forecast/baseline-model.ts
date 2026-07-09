import type { DailyRevenue } from '@/types'
import { dateRange, daysBetween, dayOfWeek, monthOf } from './date-utils'

const TREND_WINDOW_DAYS = 28
const REGRESSION_WINDOW_DAYS = 90

interface FilledDay {
  date: string
  revenue: number
}

// daily_revenue only has rows for days with at least one order — days with
// zero revenue are absent, not zero. Trend/seasonality math needs the gaps
// filled with explicit zeros or averages get skewed upward.
function fillGaps(sorted: DailyRevenue[]): FilledDay[] {
  if (sorted.length === 0) return []
  const byDate = new Map(sorted.map((r) => [r.date, r.gross_revenue]))
  return dateRange(sorted[0].date, sorted[sorted.length - 1].date).map((date) => ({
    date,
    revenue: byDate.get(date) ?? 0,
  }))
}

function trailingMovingAverage(filled: FilledDay[], window: number): number[] {
  const trend: number[] = []
  let sum = 0
  for (let i = 0; i < filled.length; i++) {
    sum += filled[i].revenue
    if (i >= window) sum -= filled[i - window].revenue
    trend.push(sum / Math.min(i + 1, window))
  }
  return trend
}

export function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length
  if (n === 0) return { slope: 0, intercept: 0 }
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  return { slope, intercept: yMean - slope * xMean }
}

function normalize(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return mean === 0 ? values : values.map((v) => v / mean)
}

export interface BaselineModel {
  dowIndex: number[] // length 7, 0 = Sunday — day-of-week seasonal multiplier, normalized to mean 1
  monthIndex: number[] // length 12, 0 = January — month-of-year seasonal multiplier, normalized to mean 1
  trendSlope: number
  trendIntercept: number
  trendLastX: number // x-coordinate (in the regression's own index space) of trendLastDate
  trendLastDate: string | null
}

/**
 * Decomposes daily_revenue into a trailing-moving-average trend plus
 * day-of-week and month-of-year seasonal indices (ratio of actual to trend,
 * normalized so each index set averages to 1.0).
 */
export function fitBaselineModel(dailyRevenue: DailyRevenue[]): BaselineModel {
  const sorted = [...dailyRevenue].sort((a, b) => a.date.localeCompare(b.date))
  const filled = fillGaps(sorted)

  if (filled.length === 0) {
    return {
      dowIndex: Array(7).fill(1),
      monthIndex: Array(12).fill(1),
      trendSlope: 0,
      trendIntercept: 0,
      trendLastX: 0,
      trendLastDate: null,
    }
  }

  const trend = trailingMovingAverage(filled, TREND_WINDOW_DAYS)

  const dowSums = Array(7).fill(0)
  const dowCounts = Array(7).fill(0)
  const monthSums = Array(12).fill(0)
  const monthCounts = Array(12).fill(0)
  for (let i = 0; i < filled.length; i++) {
    if (trend[i] <= 0) continue
    const ratio = filled[i].revenue / trend[i]
    const dow = dayOfWeek(filled[i].date)
    const month = monthOf(filled[i].date)
    dowSums[dow] += ratio
    dowCounts[dow] += 1
    monthSums[month] += ratio
    monthCounts[month] += 1
  }
  const dowIndex = normalize(dowSums.map((s, i) => (dowCounts[i] > 0 ? s / dowCounts[i] : 1)))
  const monthIndex = normalize(monthSums.map((s, i) => (monthCounts[i] > 0 ? s / monthCounts[i] : 1)))

  const regressionSlice = trend.slice(-Math.min(REGRESSION_WINDOW_DAYS, trend.length))
  const { slope, intercept } = linearRegression(regressionSlice)

  return {
    dowIndex,
    monthIndex,
    trendSlope: slope,
    trendIntercept: intercept,
    trendLastX: regressionSlice.length - 1,
    trendLastDate: filled[filled.length - 1].date,
  }
}

function projectedTrendAt(model: BaselineModel, date: string): number {
  if (!model.trendLastDate) return 0
  const x = model.trendLastX + daysBetween(model.trendLastDate, date)
  return Math.max(0, model.trendSlope * x + model.trendIntercept)
}

/** forecast(date) = projected_trend(date) * day_of_week_index(date) * month_index(date) */
export function baselineForecast(model: BaselineModel, date: string): number {
  return projectedTrendAt(model, date) * model.dowIndex[dayOfWeek(date)] * model.monthIndex[monthOf(date)]
}

import type { CustomerOrderRow, DailyRevenue } from '@/types'
import { yearMonthOf, monthsBetween, daysInMonth, dayOfWeek, todayStr } from './date-utils'
import { linearRegression, type BaselineModel } from './baseline-model'

const MAX_COHORT_AGE_MONTHS = 12
const RECENT_MONTHS_FOR_AOV = 6

export interface CohortModel {
  repurchaseCurve: number[] // index = months since acquisition; value = avg % of month-0 revenue realized
  avgFirstOrderValue: number
  newCustomerTrend: { slope: number; intercept: number; lastX: number; lastMonth: string }
  cohortMonth0Revenue: Map<string, number> // acquisitionMonth ('YYYY-MM') -> total month-0 revenue
}

/**
 * Builds a repurchase curve (% of month-0 revenue realized at month 0,1,2,...)
 * from per-customer order history, plus a trend for projecting new-customer
 * acquisition forward. Cohorts younger than a given age are excluded from
 * that age's curve average, so immature cohorts don't bias it toward 0.
 */
export function fitCohortModel(customerOrders: CustomerOrderRow[], dailyRevenue: DailyRevenue[]): CohortModel {
  const buckets = new Map<string, Map<number, number>>() // acquisitionMonth -> monthsSinceAcquisition -> revenue
  for (const o of customerOrders) {
    const acqMonth = yearMonthOf(o.acquisitionDate)
    const age = monthsBetween(acqMonth, yearMonthOf(o.orderDate))
    if (age < 0) continue
    const ageMap = buckets.get(acqMonth) ?? new Map<number, number>()
    ageMap.set(age, (ageMap.get(age) ?? 0) + o.revenue)
    buckets.set(acqMonth, ageMap)
  }

  const cohortMonth0Revenue = new Map<string, number>()
  for (const [acqMonth, ageMap] of buckets) cohortMonth0Revenue.set(acqMonth, ageMap.get(0) ?? 0)

  const now = yearMonthOf(todayStr())
  const curveSum = Array(MAX_COHORT_AGE_MONTHS + 1).fill(0)
  const curveCount = Array(MAX_COHORT_AGE_MONTHS + 1).fill(0)
  for (const [acqMonth, ageMap] of buckets) {
    const month0 = ageMap.get(0) ?? 0
    if (month0 <= 0) continue
    const cohortAgeNow = monthsBetween(acqMonth, now)
    for (let age = 0; age <= Math.min(MAX_COHORT_AGE_MONTHS, cohortAgeNow); age++) {
      curveSum[age] += (ageMap.get(age) ?? 0) / month0
      curveCount[age] += 1
    }
  }
  const repurchaseCurve = curveSum.map((s, age) => (curveCount[age] > 0 ? s / curveCount[age] : age === 0 ? 1 : 0))

  const monthlyNew = new Map<string, { count: number; revenue: number }>()
  for (const r of dailyRevenue) {
    const m = yearMonthOf(r.date)
    const entry = monthlyNew.get(m) ?? { count: 0, revenue: 0 }
    entry.count += r.new_customer_count
    entry.revenue += r.new_customer_revenue
    monthlyNew.set(m, entry)
  }
  const monthsSorted = Array.from(monthlyNew.keys()).sort()
  const counts = monthsSorted.map((m) => monthlyNew.get(m)!.count)
  const { slope, intercept } = linearRegression(counts)

  const recentMonths = monthsSorted.slice(-RECENT_MONTHS_FOR_AOV)
  const recentRevenue = recentMonths.reduce((s, m) => s + monthlyNew.get(m)!.revenue, 0)
  const recentCount = recentMonths.reduce((s, m) => s + monthlyNew.get(m)!.count, 0)

  return {
    repurchaseCurve,
    avgFirstOrderValue: recentCount > 0 ? recentRevenue / recentCount : 0,
    newCustomerTrend: {
      slope,
      intercept,
      lastX: counts.length - 1,
      lastMonth: monthsSorted[monthsSorted.length - 1] ?? now,
    },
    cohortMonth0Revenue,
  }
}

/**
 * new-customer revenue: trend-projected new customer count x avg first-order value.
 * returning-customer revenue: sum, over every known cohort, of that cohort's
 * month-0 revenue x the repurchase curve value at its age relative to targetMonth.
 * Known limitation (v1): cohorts acquired *during* the forecast horizon only
 * contribute their own projected first-order revenue in their acquisition
 * month — their future repurchase isn't chained forward, since that would
 * require projecting a month-0 revenue for a cohort that doesn't exist yet.
 */
export function cohortForecastMonthly(model: CohortModel, targetMonth: string): number {
  const monthIndex = model.newCustomerTrend.lastX + monthsBetween(model.newCustomerTrend.lastMonth, targetMonth)
  const projectedNewCount = Math.max(0, model.newCustomerTrend.slope * monthIndex + model.newCustomerTrend.intercept)
  const newRevenue = projectedNewCount * model.avgFirstOrderValue

  let returningRevenue = 0
  for (const [acqMonth, month0Revenue] of model.cohortMonth0Revenue) {
    const age = monthsBetween(acqMonth, targetMonth)
    if (age <= 0 || age > MAX_COHORT_AGE_MONTHS) continue
    returningRevenue += month0Revenue * model.repurchaseCurve[age]
  }

  return newRevenue + returningRevenue
}

/** Distributes a monthly cohort forecast across days using the baseline model's day-of-week index. */
export function cohortForecastDaily(cohortModel: CohortModel, baselineModel: BaselineModel, date: string): number {
  const targetMonth = yearMonthOf(date)
  const monthlyTotal = cohortForecastMonthly(cohortModel, targetMonth)
  const days = daysInMonth(targetMonth)
  const weights = days.map((d) => baselineModel.dowIndex[dayOfWeek(d)])
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const weight = baselineModel.dowIndex[dayOfWeek(date)]
  return totalWeight > 0 ? (monthlyTotal * weight) / totalWeight : monthlyTotal / days.length
}

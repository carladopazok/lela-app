import type { CustomerOrderRow, DailyRevenue } from '@/types'
import { yearMonthOf, monthsBetween, daysInMonth, dayOfWeek, todayStr } from './date-utils'
import { linearRegression, type BaselineModel } from './baseline-model'

const MAX_COHORT_AGE_MONTHS = 12
const RECENT_MONTHS_FOR_AOV = 6

export interface CohortForecast {
  revenue: number
  orderCount: number
}

export interface CohortModel {
  repurchaseCurve: number[] // index = months since acquisition; value = avg % of month-0 revenue realized
  orderRepurchaseCurve: number[] // same idea, in order-count terms
  avgFirstOrderValue: number
  newCustomerTrend: { slope: number; intercept: number; lastX: number; lastMonth: string } // slope/intercept are in "new customers per month" units — doubles as the new-order-count trend, since a cohort's month-0 order count equals its new customer count
  cohortMonth0Revenue: Map<string, number> // acquisitionMonth ('YYYY-MM') -> total month-0 revenue
  cohortMonth0OrderCount: Map<string, number> // acquisitionMonth -> total month-0 order count
}

/**
 * Builds a repurchase curve (% of month-0 revenue/orders realized at month
 * 0,1,2,...) from per-customer order history, plus a trend for projecting
 * new-customer acquisition forward. Cohorts younger than a given age are
 * excluded from that age's curve average, so immature cohorts don't bias it
 * toward 0.
 */
export function fitCohortModel(customerOrders: CustomerOrderRow[], dailyRevenue: DailyRevenue[]): CohortModel {
  const revenueBuckets = new Map<string, Map<number, number>>() // acquisitionMonth -> monthsSinceAcquisition -> revenue
  const countBuckets = new Map<string, Map<number, number>>() // acquisitionMonth -> monthsSinceAcquisition -> order count
  for (const o of customerOrders) {
    const acqMonth = yearMonthOf(o.acquisitionDate)
    const age = monthsBetween(acqMonth, yearMonthOf(o.orderDate))
    if (age < 0) continue

    const revenueAgeMap = revenueBuckets.get(acqMonth) ?? new Map<number, number>()
    revenueAgeMap.set(age, (revenueAgeMap.get(age) ?? 0) + o.revenue)
    revenueBuckets.set(acqMonth, revenueAgeMap)

    const countAgeMap = countBuckets.get(acqMonth) ?? new Map<number, number>()
    countAgeMap.set(age, (countAgeMap.get(age) ?? 0) + 1)
    countBuckets.set(acqMonth, countAgeMap)
  }

  const cohortMonth0Revenue = new Map<string, number>()
  for (const [acqMonth, ageMap] of revenueBuckets) cohortMonth0Revenue.set(acqMonth, ageMap.get(0) ?? 0)
  const cohortMonth0OrderCount = new Map<string, number>()
  for (const [acqMonth, ageMap] of countBuckets) cohortMonth0OrderCount.set(acqMonth, ageMap.get(0) ?? 0)

  const now = yearMonthOf(todayStr())
  const repurchaseCurve = buildCurve(revenueBuckets, cohortMonth0Revenue, now)
  const orderRepurchaseCurve = buildCurve(countBuckets, cohortMonth0OrderCount, now)

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
    orderRepurchaseCurve,
    avgFirstOrderValue: recentCount > 0 ? recentRevenue / recentCount : 0,
    newCustomerTrend: {
      slope,
      intercept,
      lastX: counts.length - 1,
      lastMonth: monthsSorted[monthsSorted.length - 1] ?? now,
    },
    cohortMonth0Revenue,
    cohortMonth0OrderCount,
  }
}

function buildCurve(buckets: Map<string, Map<number, number>>, month0: Map<string, number>, now: string): number[] {
  const curveSum = Array(MAX_COHORT_AGE_MONTHS + 1).fill(0)
  const curveCount = Array(MAX_COHORT_AGE_MONTHS + 1).fill(0)
  for (const [acqMonth, ageMap] of buckets) {
    const base = month0.get(acqMonth) ?? 0
    if (base <= 0) continue
    const cohortAgeNow = monthsBetween(acqMonth, now)
    for (let age = 0; age <= Math.min(MAX_COHORT_AGE_MONTHS, cohortAgeNow); age++) {
      curveSum[age] += (ageMap.get(age) ?? 0) / base
      curveCount[age] += 1
    }
  }
  return curveSum.map((s, age) => (curveCount[age] > 0 ? s / curveCount[age] : age === 0 ? 1 : 0))
}

/**
 * new: trend-projected new customer count x avg first-order value (revenue)
 * or the projected count itself (orders — a cohort's month-0 order count
 * equals its new-customer count).
 * returning: sum, over every known cohort, of that cohort's month-0
 * revenue/orders x the repurchase curve value at its age relative to
 * targetMonth.
 * Known limitation (v1): cohorts acquired *during* the forecast horizon only
 * contribute their own projected first-order revenue in their acquisition
 * month — their future repurchase isn't chained forward, since that would
 * require projecting a month-0 value for a cohort that doesn't exist yet.
 */
export function cohortForecastMonthly(model: CohortModel, targetMonth: string): CohortForecast {
  const monthIndex = model.newCustomerTrend.lastX + monthsBetween(model.newCustomerTrend.lastMonth, targetMonth)
  const projectedNewCount = Math.max(0, model.newCustomerTrend.slope * monthIndex + model.newCustomerTrend.intercept)
  const newRevenue = projectedNewCount * model.avgFirstOrderValue

  let returningRevenue = 0
  let returningOrderCount = 0
  for (const [acqMonth, month0Revenue] of model.cohortMonth0Revenue) {
    const age = monthsBetween(acqMonth, targetMonth)
    if (age <= 0 || age > MAX_COHORT_AGE_MONTHS) continue
    returningRevenue += month0Revenue * model.repurchaseCurve[age]
    returningOrderCount += (model.cohortMonth0OrderCount.get(acqMonth) ?? 0) * model.orderRepurchaseCurve[age]
  }

  return {
    revenue: newRevenue + returningRevenue,
    orderCount: projectedNewCount + returningOrderCount,
  }
}

/** Distributes a monthly cohort forecast across days using the baseline model's day-of-week index. */
export function cohortForecastDaily(cohortModel: CohortModel, baselineModel: BaselineModel, date: string): CohortForecast {
  const targetMonth = yearMonthOf(date)
  const monthly = cohortForecastMonthly(cohortModel, targetMonth)
  const days = daysInMonth(targetMonth)
  const weights = days.map((d) => baselineModel.dowIndex[dayOfWeek(d)])
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const weight = baselineModel.dowIndex[dayOfWeek(date)]
  const share = totalWeight > 0 ? weight / totalWeight : 1 / days.length
  return { revenue: monthly.revenue * share, orderCount: monthly.orderCount * share }
}

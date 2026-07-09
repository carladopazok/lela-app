'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatCard from '@/components/ui/StatCard'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import type { ForecastMeta, ForecastPoint } from '@/types'

type Granularity = 'daily' | 'weekly' | 'monthly' | 'yearly'
type ModelType = 'trend' | 'cohort'

interface BackfillResult {
  dailyRevenueRows: number
  campaignFlowRevenueRows: number
  omnisendError: string | null
  acceptanceCheck: { trailing365DayGrossRevenue: number; note: string }
}

interface ChartPoint {
  date: string
  actualRevenue: number | null
  forecastRevenue: number
  priorYearRevenue: number | null
  actualOrders: number | null
  forecastOrders: number
  priorYearOrders: number | null
}

interface DisplayPoint {
  date: string
  actual: number | null
  forecast: number | null
  priorYear: number | null
}

interface RangeSum {
  actualRevenue: number | null
  forecastRevenue: number
  actualOrders: number | null
  forecastOrders: number
}

type SeriesKey = 'actual' | 'forecast' | 'priorYear'
type Metric = 'revenue' | 'orders' | 'aov'
type RangePreset = 'last30' | 'default' | 'next4weeks' | 'custom'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Default *displayed* window (what the chart shows out of the box).
const DEFAULT_HISTORY_DAYS = 90
const DEFAULT_FORECAST_DAYS = 28

// What's actually *fetched* from the API — a superset wide enough to satisfy
// any date-range preset (including "This year"-style custom ranges) without
// needing to refetch every time the displayed window changes. The Today/
// Week/Month comparison cards and the scenario/backtest math always read
// from this full fetched set regardless of what the chart is windowed to.
const FETCH_HISTORY_DAYS = 400
const FETCH_FORECAST_DAYS = 180

// Actual/Forecast share one hue (terracotta) — they're the same metric,
// observed vs. projected, distinguished by solid-vs-dashed stroke. Prior Year
// gets the one other chromatic hue this design system has (olive) so it reads
// as a genuinely separate series. See dataviz skill: a 2-hue categorical
// palette (terracotta-600 / olive-400) passes CVD separation; olive's low
// chroma is offset by the legend + dash-pattern secondary encoding.
const COLOR_ACTUAL = '#A8583A' // terracotta-600
const COLOR_FORECAST = '#A8583A'
const COLOR_PRIOR_YEAR = '#6B7A60' // olive-400
const COLOR_GRID = '#EDE4D8' // sand-200

const SERIES_META: Record<SeriesKey, { label: string; color: string }> = {
  actual: { label: 'Actual', color: COLOR_ACTUAL },
  forecast: { label: 'Forecast', color: COLOR_FORECAST },
  priorYear: { label: 'Prior Year', color: COLOR_PRIOR_YEAR },
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isoWeekMonday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setUTCDate(d.getUTCDate() + diff)
  return isoDate(d)
}

function computeDisplayRange(preset: RangePreset, customStart: string, customEnd: string, todayIso: string): { start: string; end: string } {
  const today = new Date(`${todayIso}T00:00:00Z`)
  const shift = (days: number) => isoDate(new Date(today.getTime() + days * 86_400_000))

  if (preset === 'last30') return { start: shift(-30), end: todayIso }
  if (preset === 'next4weeks') return { start: todayIso, end: shift(DEFAULT_FORECAST_DAYS) }
  if (preset === 'custom') {
    const start = customStart || shift(-DEFAULT_HISTORY_DAYS)
    const end = customEnd || shift(DEFAULT_FORECAST_DAYS)
    return start <= end ? { start, end } : { start: end, end: start }
  }
  return { start: shift(-DEFAULT_HISTORY_DAYS), end: shift(DEFAULT_FORECAST_DAYS) }
}

function bucketKeyOf(date: string, granularity: Granularity): string {
  if (granularity === 'yearly') return date.slice(0, 4)
  if (granularity === 'monthly') return date.slice(0, 7)
  if (granularity === 'weekly') return isoWeekMonday(date)
  return date
}

// Aggregates revenue AND order counts (summed) per bucket — never aggregates
// AOV directly, since averaging a ratio (or summing daily AOVs) across a
// week/month is wrong. AOV is always derived as summed-revenue/summed-orders
// after aggregation (see selectMetric).
function aggregate(points: ForecastPoint[], granularity: Granularity): ChartPoint[] {
  if (granularity === 'daily') {
    return points.map((p) => ({
      date: p.date,
      actualRevenue: p.actual,
      forecastRevenue: p.forecast,
      priorYearRevenue: p.priorYear,
      actualOrders: p.actualOrderCount,
      forecastOrders: p.forecastOrderCount,
      priorYearOrders: p.priorYearOrderCount,
    }))
  }

  const buckets = new Map<
    string,
    { actualRevenue: number; forecastRevenue: number; priorYearRevenue: number; actualOrders: number; forecastOrders: number; priorYearOrders: number; hasActual: boolean; hasPriorYear: boolean }
  >()
  for (const p of points) {
    const key = bucketKeyOf(p.date, granularity)
    const b = buckets.get(key) ?? { actualRevenue: 0, forecastRevenue: 0, priorYearRevenue: 0, actualOrders: 0, forecastOrders: 0, priorYearOrders: 0, hasActual: false, hasPriorYear: false }
    b.forecastRevenue += p.forecast
    b.forecastOrders += p.forecastOrderCount
    if (p.actual !== null) { b.actualRevenue += p.actual; b.actualOrders += p.actualOrderCount ?? 0; b.hasActual = true }
    if (p.priorYear !== null) { b.priorYearRevenue += p.priorYear; b.priorYearOrders += p.priorYearOrderCount ?? 0; b.hasPriorYear = true }
    buckets.set(key, b)
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      actualRevenue: b.hasActual ? round2(b.actualRevenue) : null,
      forecastRevenue: round2(b.forecastRevenue),
      priorYearRevenue: b.hasPriorYear ? round2(b.priorYearRevenue) : null,
      actualOrders: b.hasActual ? round2(b.actualOrders) : null,
      forecastOrders: round2(b.forecastOrders),
      priorYearOrders: b.hasPriorYear ? round2(b.priorYearOrders) : null,
    }))
}

function selectMetric(rows: ChartPoint[], metric: Metric): DisplayPoint[] {
  return rows.map((r) => {
    if (metric === 'orders') {
      return { date: r.date, actual: r.actualOrders, forecast: r.forecastOrders, priorYear: r.priorYearOrders }
    }
    if (metric === 'aov') {
      return {
        date: r.date,
        actual: r.actualOrders && r.actualOrders > 0 && r.actualRevenue !== null ? round2(r.actualRevenue / r.actualOrders) : null,
        forecast: r.forecastOrders > 0 ? round2(r.forecastRevenue / r.forecastOrders) : 0,
        priorYear: r.priorYearOrders && r.priorYearOrders > 0 && r.priorYearRevenue !== null ? round2(r.priorYearRevenue / r.priorYearOrders) : null,
      }
    }
    return { date: r.date, actual: r.actualRevenue, forecast: r.forecastRevenue, priorYear: r.priorYearRevenue }
  })
}

function metricValue(sum: RangeSum, metric: Metric): { actual: number | null; forecast: number } {
  if (metric === 'orders') return { actual: sum.actualOrders, forecast: sum.forecastOrders }
  if (metric === 'aov') {
    return {
      actual: sum.actualOrders && sum.actualOrders > 0 && sum.actualRevenue !== null ? round2(sum.actualRevenue / sum.actualOrders) : null,
      forecast: sum.forecastOrders > 0 ? round2(sum.forecastRevenue / sum.forecastOrders) : 0,
    }
  }
  return { actual: sum.actualRevenue, forecast: sum.forecastRevenue }
}

function formatCurrency(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function formatMetricValue(v: number, metric: Metric): string {
  if (metric === 'orders') return Math.round(v).toLocaleString('en-US')
  return v.toLocaleString('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: metric === 'aov' ? 2 : 0 })
}

function formatAxisDate(date: string, granularity: Granularity): string {
  if (granularity === 'yearly') return date
  if (granularity === 'monthly') return new Date(`${date}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CustomTooltip({ active, payload, label, metric }: { active?: boolean; payload?: Array<{ dataKey: string; name: string; value: number | null; stroke?: string }>; label?: string; metric: Metric }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl shadow-card-hover p-3 text-sm border border-sand-200">
      <p className="text-charcoal-700 font-medium mb-1.5">{label}</p>
      {payload.map((entry) =>
        entry.value !== null && entry.value !== undefined ? (
          <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
            <span className="w-3 h-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.stroke }} />
            <span className="text-charcoal-400">{entry.name}</span>
            <span className="text-charcoal-700 font-medium ml-auto pl-4">{formatMetricValue(entry.value, metric)}</span>
          </div>
        ) : null
      )}
    </div>
  )
}

function ToggleGroup<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex bg-sand-100 rounded-full p-1 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            value === opt.value ? 'bg-white text-terracotta-600 shadow-card' : 'text-charcoal-400 hover:text-charcoal-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SeriesToggles({ visible, onToggle }: { visible: Record<SeriesKey, boolean>; onToggle: (key: SeriesKey) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(Object.keys(SERIES_META) as SeriesKey[]).map((key) => {
        const active = visible[key]
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              active ? 'bg-white shadow-card border-transparent' : 'bg-transparent border-sand-200'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SERIES_META[key].color, opacity: active ? 1 : 0.3 }} />
            <span className={active ? 'text-charcoal-700' : 'text-charcoal-400'}>{SERIES_META[key].label}</span>
          </button>
        )
      })}
    </div>
  )
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function sumRange(points: ForecastPoint[], fromDate: string, toDate: string): RangeSum {
  let actualRevenue = 0
  let forecastRevenue = 0
  let actualOrders = 0
  let forecastOrders = 0
  let hasActual = false
  for (const p of points) {
    if (p.date < fromDate || p.date > toDate) continue
    forecastRevenue += p.forecast
    forecastOrders += p.forecastOrderCount
    if (p.actual !== null) { actualRevenue += p.actual; actualOrders += p.actualOrderCount ?? 0; hasActual = true }
  }
  return {
    actualRevenue: hasActual ? round2(actualRevenue) : null,
    forecastRevenue: round2(forecastRevenue),
    actualOrders: hasActual ? actualOrders : null,
    forecastOrders: round2(forecastOrders),
  }
}

// How many more orders (at the recent trailing AOV) would close the gap to
// this period's revenue forecast. Only meaningful while behind — 0 once
// actual revenue has already caught up.
function ordersNeeded(sum: RangeSum, recentAov: number | null): number | null {
  if (recentAov === null || recentAov <= 0) return null
  const gap = sum.forecastRevenue - (sum.actualRevenue ?? 0)
  return gap <= 0 ? 0 : Math.ceil(gap / recentAov)
}

function ComparisonCard({ label, actual, forecast, metric, ordersToGo }: { label: string; actual: number | null; forecast: number; metric: Metric; ordersToGo?: number | null }) {
  const delta = actual !== null ? actual - forecast : null
  const deltaPct = delta !== null && forecast !== 0 ? (delta / forecast) * 100 : null
  const isAhead = delta !== null && delta >= 0

  return (
    <div className="bg-white rounded-2xl shadow-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">{label}</p>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-charcoal-400 mb-0.5">Actual</p>
          <p className="text-xl font-serif font-semibold text-charcoal-700">{actual !== null ? formatMetricValue(actual, metric) : '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-charcoal-400 mb-0.5">Forecast</p>
          <p className="text-xl font-serif font-semibold text-charcoal-400">{formatMetricValue(forecast, metric)}</p>
        </div>
      </div>
      {delta !== null ? (
        <p className={`flex items-center gap-1 text-xs mt-3 font-medium ${isAhead ? 'text-olive-500' : 'text-red-600'}`}>
          {isAhead ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          {formatMetricValue(Math.abs(delta), metric)}
          {deltaPct !== null && ` (${Math.abs(deltaPct).toFixed(1)}%)`} {isAhead ? 'ahead of' : 'behind'} forecast
        </p>
      ) : (
        <p className="text-xs mt-3 text-charcoal-400">No actual data yet for this period</p>
      )}
      {ordersToGo !== undefined && ordersToGo !== null && (
        <p className="text-xs mt-2 text-charcoal-400 border-t border-sand-100 pt-2">
          {ordersToGo === 0 ? 'Already at pace to hit forecast' : `≈ ${ordersToGo} more order${ordersToGo === 1 ? '' : 's'} to hit forecast`}
        </p>
      )}
    </div>
  )
}

export default function Forecast() {
  const [metric, setMetric] = useState<Metric>('revenue')
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [model, setModel] = useState<ModelType>('trend')
  const [rangePreset, setRangePreset] = useState<RangePreset>('default')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [scenarioPercent, setScenarioPercent] = useState('')
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({ actual: true, forecast: true, priorYear: true })
  const [points, setPoints] = useState<ForecastPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [meta, setMeta] = useState<ForecastMeta | null>(null)
  const [dailyRevenueRows, setDailyRevenueRows] = useState(0)
  const [campaignFlowRevenueRows, setCampaignFlowRevenueRows] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<BackfillResult | null>(null)

  const todayIso = useMemo(() => isoDate(new Date()), [])
  const scenarioPct = parseFloat(scenarioPercent) || 0
  const { includeDummy } = useDummyData()

  async function loadForecast(m: ModelType) {
    setLoading(true)
    setError(null)
    try {
      const start = new Date()
      start.setDate(start.getDate() - FETCH_HISTORY_DAYS)
      const end = new Date()
      end.setDate(end.getDate() + FETCH_FORECAST_DAYS)
      const res = await fetch(withDummyParam(`/api/forecast?start=${isoDate(start)}&end=${isoDate(end)}&model=${m}`, includeDummy))
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPoints(data.points)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load forecast')
    } finally {
      setLoading(false)
    }
  }

  async function loadMeta() {
    try {
      const res = await fetch('/api/forecast/meta')
      const data = await res.json()
      setMeta(data.meta)
      setDailyRevenueRows(data.dailyRevenueRows)
      setCampaignFlowRevenueRows(data.campaignFlowRevenueRows)
    } catch {
      // non-fatal — the chart itself is the important part
    }
  }

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { loadForecast(model) }, [model, includeDummy])

  async function runBackfill() {
    setSyncing(true)
    setError(null)
    setLastResult(null)
    try {
      const res = await fetch('/api/forecast/backfill', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLastResult(data)
      await Promise.all([loadMeta(), loadForecast(model)])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backfill failed')
    } finally {
      setSyncing(false)
    }
  }

  // Scenario variation applies only from today forward, and scales whichever
  // field feeds the metric currently on screen — so the number you're
  // actually looking at moves by the % you typed:
  //  - revenue view: scale forecast revenue directly.
  //  - orders view: scale forecast order count directly.
  //  - AOV view: AOV = revenue / orders, so scaling revenue alone (orders
  //    left as-is) moves the ratio by exactly the same factor — scaling both
  //    together would cancel out and leave AOV unchanged, which is the bug
  //    that was reported.
  // Doesn't rewrite already-observed history, so backtest fit stays intact.
  const adjustedPoints: ForecastPoint[] = useMemo(() => {
    if (scenarioPct === 0) return points
    const factor = 1 + scenarioPct / 100
    return points.map((p) => {
      if (p.date < todayIso) return p
      if (metric === 'orders') return { ...p, forecastOrderCount: round2(p.forecastOrderCount * factor) }
      return { ...p, forecast: round2(p.forecast * factor) }
    })
  }, [points, scenarioPct, todayIso, metric])

  // The date-range picker only windows what the chart displays — it's a
  // client-side slice of the already-fetched superset, so switching presets
  // or picking a custom range never triggers a refetch, and it applies
  // identically across Revenue/Orders/AOV since they all read this same slice.
  const displayRange = useMemo(
    () => computeDisplayRange(rangePreset, customStart, customEnd, todayIso),
    [rangePreset, customStart, customEnd, todayIso]
  )
  const displayPoints = useMemo(
    () => adjustedPoints.filter((p) => p.date >= displayRange.start && p.date <= displayRange.end),
    [adjustedPoints, displayRange]
  )

  const chartData = useMemo(() => selectMetric(aggregate(displayPoints, granularity), metric), [displayPoints, granularity, metric])
  const todayBucketKey = bucketKeyOf(todayIso, granularity)

  const todaySum = useMemo(() => sumRange(adjustedPoints, todayIso, todayIso), [adjustedPoints, todayIso])
  const weekSum = useMemo(() => sumRange(adjustedPoints, isoWeekMonday(todayIso), todayIso), [adjustedPoints, todayIso])
  const monthSum = useMemo(() => sumRange(adjustedPoints, `${todayIso.slice(0, 7)}-01`, todayIso), [adjustedPoints, todayIso])

  const todayCmp = metricValue(todaySum, metric)
  const weekCmp = metricValue(weekSum, metric)
  const monthCmp = metricValue(monthSum, metric)

  // Trailing 30-day AOV from real (unadjusted, unscaled) actuals — used only
  // to translate a revenue gap into "how many orders would close it."
  const recentAov = useMemo(() => {
    const cutoff = isoDate(new Date(new Date(`${todayIso}T00:00:00Z`).getTime() - 30 * 86_400_000))
    let revenue = 0
    let orders = 0
    for (const p of points) {
      if (p.date < cutoff || p.date > todayIso || p.actual === null) continue
      revenue += p.actual
      orders += p.actualOrderCount ?? 0
    }
    return orders > 0 ? revenue / orders : null
  }, [points, todayIso])

  function toggleSeries(key: SeriesKey) {
    setVisible((v) => ({ ...v, [key]: !v[key] }))
  }

  return (
    <section className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Revenue Forecast</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">Trend, seasonality &amp; cohort projections</p>
        </div>
        <button
          onClick={runBackfill}
          disabled={syncing}
          className="flex items-center gap-2 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-terracotta-100 disabled:opacity-50"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      <div className="mb-5">
        <ToggleGroup
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'revenue', label: 'Revenue' },
            { value: 'orders', label: 'Orders' },
            { value: 'aov', label: 'AOV' },
          ]}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <ComparisonCard label="Today" actual={todayCmp.actual} forecast={todayCmp.forecast} metric={metric} />
        <ComparisonCard
          label="This week (to date)"
          actual={weekCmp.actual}
          forecast={weekCmp.forecast}
          metric={metric}
          ordersToGo={metric === 'revenue' ? ordersNeeded(weekSum, recentAov) : undefined}
        />
        <ComparisonCard
          label="This month (to date)"
          actual={monthCmp.actual}
          forecast={monthCmp.forecast}
          metric={metric}
          ordersToGo={metric === 'revenue' ? ordersNeeded(monthSum, recentAov) : undefined}
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <ToggleGroup
          value={rangePreset}
          onChange={setRangePreset}
          options={[
            { value: 'last30', label: 'Last 30 days' },
            { value: 'default', label: '90d + forecast' },
            { value: 'next4weeks', label: 'Next 4 weeks' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {rangePreset === 'custom' && (
          <div className="flex items-center gap-2 bg-white rounded-full pl-3 pr-3 py-1.5 shadow-card">
            <input
              type="date"
              value={customStart || displayRange.start}
              onChange={(e) => setCustomStart(e.target.value)}
              className="text-sm text-charcoal-700 bg-transparent outline-none"
            />
            <span className="text-charcoal-400 text-xs">to</span>
            <input
              type="date"
              value={customEnd || displayRange.end}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="text-sm text-charcoal-700 bg-transparent outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <ToggleGroup
            value={granularity}
            onChange={setGranularity}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
          <ToggleGroup
            value={model}
            onChange={setModel}
            options={[
              { value: 'trend', label: 'Trend model' },
              { value: 'cohort', label: 'Cohort model' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 bg-white rounded-full pl-4 pr-1.5 py-1.5 shadow-card">
          <span className="text-xs text-charcoal-400 whitespace-nowrap">Scenario variation</span>
          <input
            type="number"
            value={scenarioPercent}
            onChange={(e) => setScenarioPercent(e.target.value)}
            placeholder="0"
            step="0.5"
            className="w-14 text-sm text-charcoal-700 text-right bg-transparent outline-none [appearance:textfield]"
          />
          <span className="text-xs text-charcoal-400 pr-2">%</span>
        </div>
      </div>

      <div className="mb-5">
        <SeriesToggles visible={visible} onToggle={toggleSeries} />
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-4 mb-5">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
        {loading ? (
          <LoadingSpinner label="Computing forecast…" />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-charcoal-400 py-16 text-center">No data yet — click Sync now to pull revenue history.</p>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={COLOR_GRID} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatAxisDate(d, granularity)}
                tick={{ fontSize: 12, fill: '#6B6B6B' }}
                axisLine={{ stroke: COLOR_GRID }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatMetricValue(v, metric)}
                tick={{ fontSize: 12, fill: '#6B6B6B' }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip content={<CustomTooltip metric={metric} />} cursor={{ stroke: '#D4C4B0', strokeWidth: 1 }} />
              <Legend
                iconType="line"
                wrapperStyle={{ fontSize: 12, color: '#6B6B6B' }}
                formatter={(value) => <span style={{ color: '#4A4A4A' }}>{value}</span>}
              />
              <ReferenceLine x={todayBucketKey} stroke="#D4C4B0" strokeWidth={1} label={{ value: 'Today', position: 'insideTopRight', fontSize: 11, fill: '#6B6B6B' }} />
              {visible.actual && (
                <Line type="monotone" dataKey="actual" name="Actual" stroke={COLOR_ACTUAL} strokeWidth={2} dot={false} connectNulls={false} />
              )}
              {visible.forecast && (
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name={scenarioPct !== 0 ? `Forecast (${scenarioPct > 0 ? '+' : ''}${scenarioPct}%)` : 'Forecast'}
                  stroke={COLOR_FORECAST}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                />
              )}
              {visible.priorYear && (
                <Line type="monotone" dataKey="priorYear" name="Prior Year" stroke={COLOR_PRIOR_YEAR} strokeWidth={2} strokeDasharray="3 3" dot={false} connectNulls={false} strokeOpacity={0.85} />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard label="Daily revenue rows" value={String(dailyRevenueRows)} />
        <StatCard label="Campaign / flow rows" value={String(campaignFlowRevenueRows)} />
        <StatCard label="Last synced" value={formatDateTime(meta?.lastBackfillAt ?? null)} />
      </div>

      {meta && !meta.omnisendAttributionAvailable && (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-sm rounded-xl p-4 mb-4">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Omnisend campaign/flow attributed revenue isn&apos;t available yet — the forecast above is unaffected (it&apos;s built from Shopify data only).</span>
        </div>
      )}

      {lastResult && (
        <div className="bg-white rounded-2xl shadow-card p-5 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">Last sync result</h3>
          <dl className="text-charcoal-700 space-y-1.5">
            <div className="flex justify-between"><dt className="text-charcoal-400">Trailing 365d gross revenue</dt><dd>{formatCurrency(lastResult.acceptanceCheck.trailing365DayGrossRevenue)}</dd></div>
            <div className="flex justify-between"><dt className="text-charcoal-400">Omnisend status</dt><dd>{lastResult.omnisendError ?? 'ok'}</dd></div>
          </dl>
          <p className="text-xs text-charcoal-400 mt-3">{lastResult.acceptanceCheck.note}</p>
        </div>
      )}
    </section>
  )
}

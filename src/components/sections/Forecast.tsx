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

interface RawPoint extends ForecastPoint {
  scenario: number | null
}

interface ChartPoint {
  date: string
  actual: number | null
  forecast: number | null
  priorYear: number | null
  scenario: number | null
}

const HISTORY_DAYS = 90
const FORECAST_DAYS = 28

// Actual/Forecast share one hue (terracotta) — they're the same metric,
// observed vs. projected, distinguished by solid-vs-dashed stroke. Prior Year
// gets the one other chromatic hue this design system has (olive) so it reads
// as a genuinely separate series. See dataviz skill: a 2-hue categorical
// palette (terracotta-600 / olive-400) passes CVD separation; olive's low
// chroma is offset by the legend + dash-pattern secondary encoding. Scenario
// is a variant of Forecast (same hue, lighter tint, dotted), not a new identity.
const COLOR_ACTUAL = '#A8583A' // terracotta-600
const COLOR_FORECAST = '#A8583A'
const COLOR_SCENARIO = '#D0846A' // terracotta-400
const COLOR_PRIOR_YEAR = '#6B7A60' // olive-400
const COLOR_GRID = '#EDE4D8' // sand-200

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

function bucketKeyOf(date: string, granularity: Granularity): string {
  if (granularity === 'yearly') return date.slice(0, 4)
  if (granularity === 'monthly') return date.slice(0, 7)
  if (granularity === 'weekly') return isoWeekMonday(date)
  return date
}

function aggregate(points: RawPoint[], granularity: Granularity): ChartPoint[] {
  if (granularity === 'daily') return points

  const buckets = new Map<
    string,
    { actual: number; forecast: number; priorYear: number; scenario: number; hasActual: boolean; hasPriorYear: boolean; hasScenario: boolean }
  >()
  for (const p of points) {
    const key = bucketKeyOf(p.date, granularity)
    const b = buckets.get(key) ?? { actual: 0, forecast: 0, priorYear: 0, scenario: 0, hasActual: false, hasPriorYear: false, hasScenario: false }
    b.forecast += p.forecast
    if (p.actual !== null) { b.actual += p.actual; b.hasActual = true }
    if (p.priorYear !== null) { b.priorYear += p.priorYear; b.hasPriorYear = true }
    if (p.scenario !== null) { b.scenario += p.scenario; b.hasScenario = true }
    buckets.set(key, b)
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      actual: b.hasActual ? Math.round(b.actual * 100) / 100 : null,
      forecast: Math.round(b.forecast * 100) / 100,
      priorYear: b.hasPriorYear ? Math.round(b.priorYear * 100) / 100 : null,
      scenario: b.hasScenario ? Math.round(b.scenario * 100) / 100 : null,
    }))
}

function formatCurrency(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function formatAxisDate(date: string, granularity: Granularity): string {
  if (granularity === 'yearly') return date
  if (granularity === 'monthly') return new Date(`${date}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; name: string; value: number | null; stroke?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl shadow-card-hover p-3 text-sm border border-sand-200">
      <p className="text-charcoal-700 font-medium mb-1.5">{label}</p>
      {payload.map((entry) =>
        entry.value !== null && entry.value !== undefined ? (
          <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
            <span className="w-3 h-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.stroke }} />
            <span className="text-charcoal-400">{entry.name}</span>
            <span className="text-charcoal-700 font-medium ml-auto pl-4">{formatCurrency(entry.value)}</span>
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

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function sumRange(points: ForecastPoint[], fromDate: string, toDate: string): { actual: number | null; forecast: number } {
  let actual = 0
  let forecast = 0
  let hasActual = false
  for (const p of points) {
    if (p.date < fromDate || p.date > toDate) continue
    forecast += p.forecast
    if (p.actual !== null) { actual += p.actual; hasActual = true }
  }
  return { actual: hasActual ? Math.round(actual * 100) / 100 : null, forecast: Math.round(forecast * 100) / 100 }
}

function ComparisonCard({ label, actual, forecast }: { label: string; actual: number | null; forecast: number }) {
  const delta = actual !== null ? actual - forecast : null
  const deltaPct = delta !== null && forecast !== 0 ? (delta / forecast) * 100 : null
  const isAhead = delta !== null && delta >= 0

  return (
    <div className="bg-white rounded-2xl shadow-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">{label}</p>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-charcoal-400 mb-0.5">Actual</p>
          <p className="text-xl font-serif font-semibold text-charcoal-700">{actual !== null ? formatCurrency(actual) : '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-charcoal-400 mb-0.5">Forecast</p>
          <p className="text-xl font-serif font-semibold text-charcoal-400">{formatCurrency(forecast)}</p>
        </div>
      </div>
      {delta !== null ? (
        <p className={`flex items-center gap-1 text-xs mt-3 font-medium ${isAhead ? 'text-olive-500' : 'text-red-600'}`}>
          {isAhead ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          {formatCurrency(Math.abs(delta))}
          {deltaPct !== null && ` (${Math.abs(deltaPct).toFixed(1)}%)`} {isAhead ? 'ahead of' : 'behind'} forecast
        </p>
      ) : (
        <p className="text-xs mt-3 text-charcoal-400">No actual data yet for this period</p>
      )}
    </div>
  )
}

export default function Forecast() {
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [model, setModel] = useState<ModelType>('trend')
  const [scenarioPercent, setScenarioPercent] = useState('')
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
      start.setDate(start.getDate() - HISTORY_DAYS)
      const end = new Date()
      end.setDate(end.getDate() + FORECAST_DAYS)
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

  // Scenario applies only from today forward — it's a "what if the forecast
  // itself runs hot/cold by X%" toggle, not a rewrite of already-observed history.
  const rawPoints: RawPoint[] = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        scenario: scenarioPct !== 0 && p.date >= todayIso ? Math.round(p.forecast * (1 + scenarioPct / 100) * 100) / 100 : null,
      })),
    [points, scenarioPct, todayIso]
  )

  const chartData = useMemo(() => aggregate(rawPoints, granularity), [rawPoints, granularity])
  const todayBucketKey = bucketKeyOf(todayIso, granularity)

  const todayCmp = useMemo(() => sumRange(points, todayIso, todayIso), [points, todayIso])
  const weekCmp = useMemo(() => sumRange(points, isoWeekMonday(todayIso), todayIso), [points, todayIso])
  const monthCmp = useMemo(() => sumRange(points, `${todayIso.slice(0, 7)}-01`, todayIso), [points, todayIso])

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

      <div className="grid grid-cols-3 gap-4 mb-6">
        <ComparisonCard label="Today" actual={todayCmp.actual} forecast={todayCmp.forecast} />
        <ComparisonCard label="This week (to date)" actual={weekCmp.actual} forecast={weekCmp.forecast} />
        <ComparisonCard label="This month (to date)" actual={monthCmp.actual} forecast={monthCmp.forecast} />
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
          <span className="text-xs text-charcoal-400 whitespace-nowrap">Scenario</span>
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
                tickFormatter={(v) => formatCurrency(v)}
                tick={{ fontSize: 12, fill: '#6B6B6B' }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#D4C4B0', strokeWidth: 1 }} />
              <Legend
                iconType="line"
                wrapperStyle={{ fontSize: 12, color: '#6B6B6B' }}
                formatter={(value) => <span style={{ color: '#4A4A4A' }}>{value}</span>}
              />
              <ReferenceLine x={todayBucketKey} stroke="#D4C4B0" strokeWidth={1} label={{ value: 'Today', position: 'insideTopRight', fontSize: 11, fill: '#6B6B6B' }} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke={COLOR_ACTUAL} strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="forecast" name="Forecast" stroke={COLOR_FORECAST} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="priorYear" name="Prior Year" stroke={COLOR_PRIOR_YEAR} strokeWidth={2} strokeDasharray="3 3" dot={false} connectNulls={false} strokeOpacity={0.85} />
              {scenarioPct !== 0 && (
                <Line
                  type="monotone"
                  dataKey="scenario"
                  name={`Scenario (${scenarioPct > 0 ? '+' : ''}${scenarioPct}%)`}
                  stroke={COLOR_SCENARIO}
                  strokeWidth={2}
                  strokeDasharray="2 3"
                  dot={false}
                  connectNulls={false}
                />
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

'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatCard from '@/components/ui/StatCard'
import { DEMO_DELIVERABILITY_TREND, type DemoDeliverabilityPoint } from '@/lib/email-performance-demo'

// Validated categorical palette (dataviz skill, run against this project's
// light chart surface): bounce/complaint/unsubscribe are three distinct
// measured series, not an ordered sequence, so this is the categorical job —
// slots 1/2/3 of the documented default order.
const COLOR_BOUNCE = '#2a78d6'
const COLOR_COMPLAINT = '#008300'
const COLOR_UNSUBSCRIBE = '#e87ba4'
const COLOR_GRID = '#e1e0d9'

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`
}
function formatAxisDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function DeliverabilityTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; name: string; value: number; stroke?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl shadow-card-hover p-3 text-sm border border-sand-200">
      <p className="text-charcoal-700 font-medium mb-1.5">{label ? formatAxisDate(label) : ''}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="w-3 h-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.stroke }} />
          <span className="text-charcoal-400">{entry.name}</span>
          <span className="text-charcoal-700 font-medium ml-auto pl-4">{pct(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function EmailDeliverability({ useRealData }: { useRealData: boolean }) {
  const [realTrend, setRealTrend] = useState<DemoDeliverabilityPoint[] | null>(null)
  const [loading, setLoading] = useState(useRealData)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!useRealData) return
    setLoading(true)
    setError(null)
    fetch('/api/omnisend/analytics/deliverability')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setRealTrend(d.trend ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [useRealData])

  const trend = useRealData ? realTrend ?? [] : DEMO_DELIVERABILITY_TREND

  if (useRealData && loading) return <LoadingSpinner label="Fetching live deliverability data…" />

  if (useRealData && error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-4">
        <AlertCircle size={16} /> {error}
      </div>
    )
  }

  const first = trend[0]
  const last = trend[trend.length - 1]

  return (
    <div>
      {!first || !last ? (
        <div className="text-center py-12 text-charcoal-400 text-sm">No deliverability data yet for this period.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard label="Bounce rate" value={pct(last.bounceRate)} trend={{ direction: last.bounceRate >= first.bounceRate ? 'down' : 'up', text: `from ${pct(first.bounceRate)}` }} />
          <StatCard label="Spam complaint rate" value={pct(last.complaintRate)} trend={{ direction: last.complaintRate >= first.complaintRate ? 'down' : 'up', text: `from ${pct(first.complaintRate)}` }} />
          <StatCard label="Unsubscribe rate" value={pct(last.unsubscribeRate)} trend={{ direction: last.unsubscribeRate >= first.unsubscribeRate ? 'down' : 'up', text: `from ${pct(first.unsubscribeRate)}` }} />
        </div>
      )}

      {useRealData ? (
        <div className="flex items-start gap-2 text-xs text-charcoal-400 bg-sand-100 border border-sand-300 rounded-xl px-4 py-3 mb-4">
          <Info size={13} className="flex-shrink-0 mt-0.5" />
          <p>Live weekly trend from your Omnisend account (last 90 days, account-wide — per-flow/per-campaign breakdown isn't available via Omnisend's API yet).</p>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <p>All three metrics have drifted the wrong direction over the last 12 weeks. Still under 1% bounce, but worth watching before it compounds.</p>
        </div>
      )}

      {trend.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card p-5">
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={trend} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={COLOR_GRID} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatAxisDate}
                tick={{ fontSize: 12, fill: '#898781' }}
                axisLine={{ stroke: COLOR_GRID }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                tick={{ fontSize: 12, fill: '#898781' }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<DeliverabilityTooltip />} cursor={{ stroke: '#D4C4B0', strokeWidth: 1 }} />
              <Legend
                iconType="line"
                wrapperStyle={{ fontSize: 12, color: '#898781' }}
                formatter={(value) => <span style={{ color: '#52514e' }}>{value}</span>}
              />
              <Line type="monotone" dataKey="bounceRate" name="Bounce rate" stroke={COLOR_BOUNCE} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="complaintRate" name="Complaint rate" stroke={COLOR_COMPLAINT} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="unsubscribeRate" name="Unsubscribe rate" stroke={COLOR_UNSUBSCRIBE} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

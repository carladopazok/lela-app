'use client'

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
import { Info } from 'lucide-react'
import {
  DEMO_RECENCY_TREND,
  EMAIL_ENGAGEMENT_META,
  currentRecencyBuckets,
} from '@/lib/email-performance-demo'

// Validated ordinal ramp (dataviz skill): 30/60/90-day windows are a nested,
// ordered sequence (each window contains the last), not independent
// identities — one hue, monotone lightness, light = shorter window.
const COLOR_30D = '#6da7ec'
const COLOR_60D = '#2a78d6'
const COLOR_90D = '#184f95'
const COLOR_GRID = '#e1e0d9'

function formatAxisDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function RecencyTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; name: string; value: number; stroke?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl shadow-card-hover p-3 text-sm border border-sand-200">
      <p className="text-charcoal-700 font-medium mb-1.5">{label ? formatAxisDate(label) : ''}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="w-3 h-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.stroke }} />
          <span className="text-charcoal-400">{entry.name}</span>
          <span className="text-charcoal-700 font-medium ml-auto pl-4">{entry.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function EmailEngagementRecency() {
  const buckets = currentRecencyBuckets()

  return (
    <div>
      <div className="flex items-start gap-2 text-xs text-charcoal-400 bg-sand-100 border border-sand-300 rounded-xl px-4 py-3 mb-6">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <p>Omnisend doesn't expose per-contact engagement data to this app yet — these figures are modeled to show what this view will look like once it does. Bucket names and colors intentionally echo Customer Intelligence's lifecycle stages for visual consistency; no tag is written onto real customer records from this data.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {buckets.map((b) => {
          const meta = EMAIL_ENGAGEMENT_META[b.bucket]
          return (
            <div key={b.bucket} className={`rounded-2xl border px-4 py-3 ${meta.bg} ${meta.border}`}>
              <p className={`font-serif text-2xl tracking-tight ${meta.text}`}>{b.pct.toFixed(1)}%</p>
              <p className={`text-xs mt-0.5 ${meta.text}`}>{meta.label}</p>
              <p className={`text-[11px] mt-1 opacity-80 ${meta.text}`}>{meta.window}</p>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl shadow-card p-5">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={DEMO_RECENCY_TREND} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={COLOR_GRID} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatAxisDate}
              tick={{ fontSize: 12, fill: '#898781' }}
              axisLine={{ stroke: COLOR_GRID }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 12, fill: '#898781' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<RecencyTooltip />} cursor={{ stroke: '#D4C4B0', strokeWidth: 1 }} />
            <Legend
              iconType="line"
              wrapperStyle={{ fontSize: 12, color: '#898781' }}
              formatter={(value) => <span style={{ color: '#52514e' }}>{value}</span>}
            />
            <Line type="monotone" dataKey="opened30" name="Opened in last 30 days" stroke={COLOR_30D} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="opened60" name="Opened in last 60 days" stroke={COLOR_60D} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="opened90" name="Opened in last 90 days" stroke={COLOR_90D} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

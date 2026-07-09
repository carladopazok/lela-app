'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import StatCard from '@/components/ui/StatCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import type { SalesMetrics } from '@/types'

function fmt(n: number, currency: string) {
  return n.toLocaleString('es-ES', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PERIODS: { label: string; days: number }[] = [
  { label: 'Today',    days: 0   },
  { label: 'Last 30d', days: 30  },
  { label: 'Last 60d', days: 60  },
  { label: 'Last 90d', days: 90  },
  { label: 'Last 365d',days: 365 },
  { label: 'All Time', days: -1  },
]

function periodSubtitle(days: number) {
  if (days === 0) return 'Today — paid orders'
  if (days === -1) return 'All time — paid orders'
  return `Last ${days} days — paid orders`
}

export default function SalesOverview() {
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeDays, setActiveDays] = useState(30)
  const { includeDummy } = useDummyData()

  async function load(days: number) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(withDummyParam(`/api/shopify/sales-overview?days=${days}`, includeDummy))
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMetrics(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(activeDays) }, [activeDays, includeDummy])

  function handlePeriod(days: number) {
    setActiveDays(days)
  }

  return (
    <section className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Sales Overview</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">{periodSubtitle(activeDays)}</p>
        </div>
        <button
          onClick={() => load(activeDays)}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-terracotta-100 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-8">
        {PERIODS.map(({ label, days }) => (
          <button
            key={days}
            onClick={() => handlePeriod(days)}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50
              ${activeDays === days
                ? 'bg-terracotta-500 text-white shadow-sm'
                : 'bg-white border border-sand-300 text-charcoal-500 hover:bg-sand-100 hover:border-sand-400'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner label="Pulling sales data…" />}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!loading && !error && metrics && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard
              label="Total Revenue"
              value={fmt(metrics.totalRevenue, metrics.currency)}
              sub={periodSubtitle(activeDays)}
              accent
            />
            <StatCard
              label="Orders"
              value={metrics.orderCount.toLocaleString()}
              sub="paid orders"
            />
            <StatCard
              label="Avg. Order Value"
              value={fmt(metrics.aov, metrics.currency)}
              sub="total revenue ÷ orders"
            />
            <StatCard
              label="Total Refunds"
              value={fmt(metrics.totalRefunds, metrics.currency)}
              sub="full &amp; partial refunds"
            />
          </div>

          {metrics.orderCount > 0 && (
            <div className="bg-white rounded-2xl shadow-card p-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">Health Snapshot</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-charcoal-500">Refund rate</span>
                  <span className="font-medium text-charcoal-700">
                    {metrics.totalRevenue > 0
                      ? `${((metrics.totalRefunds / metrics.totalRevenue) * 100).toFixed(1)}%`
                      : '—'}
                  </span>
                </div>
                <div className="w-full bg-sand-200 rounded-full h-1.5">
                  <div
                    className="bg-terracotta-500 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min((metrics.totalRefunds / Math.max(metrics.totalRevenue, 1)) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

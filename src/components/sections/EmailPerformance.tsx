'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle, TrendingUp } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { CampaignRow } from '@/types'

function pct(n: number | null) {
  if (n === null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function revenue(n: number | null, currency: string) {
  if (n === null || n === 0) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function RateBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-charcoal-400">—</span>
  const pctVal = Math.min(value * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-sand-200 rounded-full h-1.5 flex-shrink-0">
        <div className="bg-terracotta-500 h-1.5 rounded-full" style={{ width: `${pctVal}%` }} />
      </div>
      <span className="text-sm text-charcoal-700 w-12">{pct(value)}</span>
    </div>
  )
}

export default function EmailPerformance() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/omnisend/campaigns')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCampaigns(data.campaigns)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const avgOpenRate = campaigns.length > 0
    ? campaigns.filter(c => c.openRate !== null).reduce((s, c) => s + (c.openRate ?? 0), 0) /
      campaigns.filter(c => c.openRate !== null).length
    : null

  return (
    <section className="max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Email Performance</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">Last 10 Omnisend campaigns</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-terracotta-100 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading && <LoadingSpinner label="Fetching campaigns…" />}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!loading && !error && campaigns.length === 0 && (
        <div className="text-center py-20 text-charcoal-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">No campaigns found</p>
          <p className="text-sm mt-1">Send your first Omnisend campaign to see data here.</p>
        </div>
      )}

      {!loading && !error && campaigns.length > 0 && (
        <>
          {avgOpenRate !== null && (
            <div className="flex items-center gap-3 bg-olive-500 text-white rounded-2xl px-6 py-4 mb-6">
              <TrendingUp size={18} />
              <p className="text-sm font-medium">
                Avg. open rate across these campaigns: <strong>{pct(avgOpenRate)}</strong>
              </p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sand-100 text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Campaign</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Sent</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Recipients</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Open Rate</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Click Rate</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-cream-100 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-charcoal-700 max-w-xs truncate">{c.name}</p>
                      <p className="text-xs text-charcoal-400 mt-0.5 capitalize">{c.status}</p>
                    </td>
                    <td className="px-6 py-4 text-charcoal-500">{formatDate(c.sentAt)}</td>
                    <td className="px-6 py-4 text-charcoal-700 font-medium">{c.totalSent.toLocaleString()}</td>
                    <td className="px-6 py-4"><RateBar value={c.openRate} /></td>
                    <td className="px-6 py-4"><RateBar value={c.clickRate} /></td>
                    <td className="px-6 py-4 text-right font-medium text-olive-500">
                      {revenue(c.attributedRevenue, c.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

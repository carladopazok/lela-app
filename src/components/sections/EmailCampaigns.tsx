'use client'

import { useEffect, useState } from 'react'
import { Info, AlertCircle } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatCard from '@/components/ui/StatCard'
import { DEMO_CAMPAIGNS, campaignRate, unsubscribeCost, ESTIMATED_SUBSCRIBER_VALUE_EUR } from '@/lib/email-performance-demo'
import type { CampaignRow } from '@/types'

interface CampaignDisplayRow {
  id: string
  name: string
  sentAt: string
  totalSent: number
  openRate: number | null
  clickRate: number | null
  bounced: number
  bounceRate: number
  complained: number
  complaintRate: number
  unsubscribed: number
  unsubscribeRate: number
  unsubCost: number
  revenue: number | null
  isBlip: boolean
}

function fromDemo(): CampaignDisplayRow[] {
  return DEMO_CAMPAIGNS.map((c) => ({
    id: c.id,
    name: c.name,
    sentAt: c.sentAt,
    totalSent: c.totalSent,
    openRate: campaignRate(c, 'opened'),
    clickRate: campaignRate(c, 'clicked'),
    bounced: c.bounced,
    bounceRate: campaignRate(c, 'bounced'),
    complained: c.complained,
    complaintRate: campaignRate(c, 'complained'),
    unsubscribed: c.unsubscribed,
    unsubscribeRate: campaignRate(c, 'unsubscribed'),
    unsubCost: unsubscribeCost(c),
    revenue: c.revenue,
    isBlip: c.id === 'c4',
  }))
}

function fromReal(campaigns: CampaignRow[]): CampaignDisplayRow[] {
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    sentAt: c.sentAt,
    totalSent: c.totalSent,
    openRate: c.openRate,
    clickRate: c.clickRate,
    bounced: c.bounced,
    bounceRate: c.totalSent > 0 ? c.bounced / c.totalSent : 0,
    complained: c.complained,
    complaintRate: c.totalSent > 0 ? c.complained / c.totalSent : 0,
    unsubscribed: c.unsubscribed,
    unsubscribeRate: c.totalSent > 0 ? c.unsubscribed / c.totalSent : 0,
    unsubCost: c.unsubscribed * ESTIMATED_SUBSCRIBER_VALUE_EUR,
    revenue: c.attributedRevenue,
    isBlip: false,
  }))
}

function pct(n: number | null, decimals = 1) {
  if (n === null) return '—'
  return `${(n * 100).toFixed(decimals)}%`
}
function eur(n: number | null) {
  if (n === null) return '—'
  return `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function EmailCampaigns({ useRealData }: { useRealData: boolean }) {
  const [realRows, setRealRows] = useState<CampaignDisplayRow[] | null>(null)
  const [loading, setLoading] = useState(useRealData)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!useRealData) return
    setLoading(true)
    setError(null)
    fetch('/api/omnisend/campaigns')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setRealRows(fromReal(d.campaigns ?? []))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [useRealData])

  if (useRealData && loading) return <LoadingSpinner label="Fetching live campaigns…" />

  if (useRealData && error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-4">
        <AlertCircle size={16} /> {error}
      </div>
    )
  }

  const rows = (useRealData ? realRows ?? [] : fromDemo()).sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  const totalSent = rows.reduce((s, c) => s + c.totalSent, 0)
  const totalRevenue = rows.reduce((s, c) => s + (c.revenue ?? 0), 0)
  const hasAnyRevenue = rows.some((c) => c.revenue !== null)
  const totalUnsubCost = rows.reduce((s, c) => s + c.unsubCost, 0)

  return (
    <div>
      {rows.length === 0 ? (
        <div className="text-center py-16 text-charcoal-400 text-sm">No campaigns found.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="Total sent" value={totalSent.toLocaleString()} sub={`Across last ${rows.length} campaigns`} />
            <StatCard label="Attributed revenue" value={hasAnyRevenue ? eur(totalRevenue) : '—'} sub={useRealData ? "Not available from Omnisend's campaigns endpoint" : undefined} />
            <StatCard label="Unsubscribe cost" value={eur(totalUnsubCost)} sub={`${rows.reduce((s, c) => s + c.unsubscribed, 0)} unsubscribes · €${ESTIMATED_SUBSCRIBER_VALUE_EUR}/subscriber est.`} />
          </div>

          <div className="flex items-start gap-2 text-xs text-charcoal-400 bg-sand-100 border border-sand-300 rounded-xl px-4 py-3 mb-4">
            <Info size={13} className="flex-shrink-0 mt-0.5" />
            <p>Open rate is shown small and secondary here — Apple Mail Privacy Protection pre-fetches images for a large share of opens, so it no longer reliably reflects real engagement. Click rate and unsubscribe cost are the more trustworthy signals for list-wide health.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sand-100 text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Campaign</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Sent</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-300">Open rate</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Click rate</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Bounce</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Complaints</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Unsubs</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400 text-right">Unsub cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {rows.map((c) => (
                  <CampaignTableRow key={c.id} row={c} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function CampaignTableRow({ row: c }: { row: CampaignDisplayRow }) {
  return (
    <tr className="hover:bg-cream-100 transition-colors">
      <td className="px-6 py-4">
        <p className="font-medium text-charcoal-700 max-w-xs truncate">{c.name}</p>
        <p className="text-xs text-charcoal-400 mt-0.5">{formatDate(c.sentAt)}</p>
      </td>
      <td className="px-6 py-4 text-charcoal-700 font-medium">{c.totalSent.toLocaleString()}</td>
      <td className="px-6 py-4 text-xs text-charcoal-300">{pct(c.openRate)}</td>
      <td className="px-6 py-4 text-charcoal-700">{pct(c.clickRate)}</td>
      <td className="px-6 py-4 text-charcoal-500">
        {c.bounced} <span className="text-charcoal-300">· {pct(c.bounceRate, 2)}</span>
      </td>
      <td className="px-6 py-4 text-charcoal-500">
        {c.complained} <span className="text-charcoal-300">· {pct(c.complaintRate, 2)}</span>
      </td>
      <td className={`px-6 py-4 ${c.isBlip ? 'text-amber-700 font-medium' : 'text-charcoal-500'}`}>
        {c.unsubscribed} <span className={c.isBlip ? 'text-amber-500' : 'text-charcoal-300'}>· {pct(c.unsubscribeRate, 2)}</span>
      </td>
      <td className="px-6 py-4 text-right font-medium text-charcoal-700">{eur(c.unsubCost)}</td>
    </tr>
  )
}

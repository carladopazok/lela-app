'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, AlertCircle, Info, TrendingUp, Mail } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatCard from '@/components/ui/StatCard'
import CollapsibleCard from '@/components/ui/CollapsibleCard'
import {
  DEMO_FLOWS,
  flowAudience,
  flowConverted,
  flowRevenue,
  flowConversionRate,
  flowRevenuePerRecipient,
  type DemoFlow,
} from '@/lib/email-performance-demo'
import type { RealFlowRow } from '@/app/api/omnisend/analytics/flows/route'

function pct(n: number | null) {
  if (n === null) return '—'
  return `${(n * 100).toFixed(1)}%`
}
function eur(n: number | null) {
  if (n === null) return '—'
  return `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function FunnelTable({ flow }: { flow: DemoFlow }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Email</th>
            <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Entered</th>
            <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Opened</th>
            <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Clicked</th>
            <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Converted</th>
            <th className="py-2 text-xs font-semibold uppercase tracking-wider text-charcoal-400 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-200">
          {flow.emails.map((step, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-4 text-charcoal-700 font-medium max-w-[220px]">{step.name}</td>
              <td className="py-2.5 pr-4 text-charcoal-500">{step.entered.toLocaleString()}</td>
              <td className="py-2.5 pr-4 text-charcoal-500">
                {step.opened.toLocaleString()}
                <span className="text-charcoal-300"> · {pct(step.opened / step.entered)}</span>
              </td>
              <td className="py-2.5 pr-4 text-charcoal-500">
                {step.clicked.toLocaleString()}
                <span className="text-charcoal-300"> · {pct(step.clicked / step.entered)}</span>
              </td>
              <td className="py-2.5 pr-4 text-charcoal-500">
                {step.converted.toLocaleString()}
                <span className="text-charcoal-300"> · {pct(step.converted / step.entered)}</span>
              </td>
              <td className="py-2.5 text-right font-medium text-olive-600">{eur(step.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DemoFlows() {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set([DEMO_FLOWS[0]?.id]))

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const totalRevenue = DEMO_FLOWS.reduce((s, f) => s + flowRevenue(f), 0)
  const totalConverted = DEMO_FLOWS.reduce((s, f) => s + flowConverted(f), 0)
  const ranked = [...DEMO_FLOWS].sort((a, b) => flowRevenuePerRecipient(b) - flowRevenuePerRecipient(a))
  const best = ranked[0]
  const worst = ranked[ranked.length - 1]

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Flow revenue" value={eur(totalRevenue)} sub={`${totalConverted} conversions across ${DEMO_FLOWS.length} flows`} />
        <StatCard label="Best performer" value={best.name} sub={`${eur(flowRevenuePerRecipient(best))} / recipient`} trend={{ direction: 'up', text: pct(flowConversionRate(best)) + ' conversion' }} />
        <StatCard label="Needs attention" value={worst.name} sub={`${eur(flowRevenuePerRecipient(worst))} / recipient`} trend={{ direction: 'down', text: pct(flowConversionRate(worst)) + ' conversion' }} />
      </div>

      <div className="space-y-3">
        {DEMO_FLOWS.map((flow) => (
          <CollapsibleCard
            key={flow.id}
            label={flow.name}
            count={flowAudience(flow)}
            isOpen={openIds.has(flow.id)}
            onToggle={() => toggle(flow.id)}
            icon={<TrendingUp size={13} />}
          >
            <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
              <span className="text-charcoal-700 font-medium">{pct(flowConversionRate(flow))} conversion</span>
              <span className="text-charcoal-300">·</span>
              <span className="text-charcoal-700 font-medium">{eur(flowRevenuePerRecipient(flow))} / recipient</span>
              <span className="text-charcoal-300">·</span>
              <span className="text-olive-600 font-medium">{eur(flowRevenue(flow))} total</span>
            </div>
            {flow.diagnosticNote && (
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <p>{flow.diagnosticNote}</p>
              </div>
            )}
            <FunnelTable flow={flow} />
          </CollapsibleCard>
        ))}
      </div>
    </div>
  )
}

function RealStepsList({ steps }: { steps: RealFlowRow['steps'] }) {
  if (steps.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-charcoal-400 mb-2">Steps</p>
      <ul className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <Mail size={13} className="text-charcoal-300 flex-shrink-0" />
            <span className="text-charcoal-700">{s.subject}</span>
            <span className="text-charcoal-300 flex-shrink-0">· {s.delayLabel}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-2 text-xs text-charcoal-400 bg-sand-100 border border-sand-300 rounded-xl px-3 py-2.5 mt-3">
        <Info size={12} className="flex-shrink-0 mt-0.5" />
        <p>Step order and subject lines are real. Per-step performance isn&apos;t available from Omnisend&apos;s API — the stats above are totals for the whole flow, not broken down by individual email.</p>
      </div>
    </div>
  )
}

function RealFlows() {
  const [flows, setFlows] = useState<RealFlowRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    setError(null)
    setAnalyticsError(null)
    fetch('/api/omnisend/analytics/flows')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        const rows: RealFlowRow[] = d.flows ?? []
        setFlows(rows)
        setAnalyticsError(d.analyticsError ?? null)
        setOpenIds(new Set(rows[0] ? [rows[0].id] : []))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) return <LoadingSpinner label="Fetching live flow data…" />

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-4">
        <AlertCircle size={16} /> {error}
      </div>
    )
  }

  if (!flows || flows.length === 0) {
    return <div className="text-center py-16 text-charcoal-400 text-sm">No active automations found in Omnisend.</div>
  }

  return (
    <div>
      {analyticsError && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <p>Flow structure loaded fine, but performance numbers didn&apos;t: <span className="font-mono text-xs">{analyticsError}</span> — showing real names and steps below with stats as &quot;—&quot; until this clears.</p>
        </div>
      )}
      <div className="space-y-3">
      {flows.map((flow) => (
        <CollapsibleCard
          key={flow.id}
          label={flow.name}
          count={flow.sent}
          isOpen={openIds.has(flow.id)}
          onToggle={() => toggle(flow.id)}
          icon={<TrendingUp size={13} />}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-sm">
            <span className="text-charcoal-700 font-medium">{pct(flow.openRate)} open</span>
            <span className="text-charcoal-700 font-medium">{pct(flow.clickRate)} click</span>
            <span className="text-charcoal-700 font-medium">{pct(flow.placedOrderRate)} placed order</span>
            <span className="text-olive-600 font-medium">{eur(flow.revenue)} revenue</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-xs text-charcoal-400">
            <span>Bounce {pct(flow.bounceRate)}</span>
            <span>Spam {pct(flow.complaintRate)}</span>
            <span>Unsub {pct(flow.unsubscribeRate)}</span>
          </div>
          <RealStepsList steps={flow.steps} />
        </CollapsibleCard>
      ))}
      </div>
    </div>
  )
}

export default function EmailFlows({ useRealData }: { useRealData: boolean }) {
  return useRealData ? <RealFlows /> : <DemoFlows />
}

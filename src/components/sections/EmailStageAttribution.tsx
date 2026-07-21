'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { LIFECYCLE_STAGE_META, type LifecycleStage } from '@/lib/segmentation'
import { ILLUSTRATIVE_ATTRIBUTION_EXAMPLES } from '@/lib/email-performance-demo'

interface RealTransition {
  customerId: number
  oldStage: LifecycleStage | null
  newStage: LifecycleStage
  changedAt: string
  matchedFlow: string | null
}

function StagePill({ stage }: { stage: LifecycleStage }) {
  const meta = LIFECYCLE_STAGE_META[stage]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.text} ${meta.border}`}>
      {stage}
    </span>
  )
}

function FlowMatch({ matchedFlow }: { matchedFlow: string | null }) {
  if (matchedFlow) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-olive-600 font-medium">
        <CheckCircle2 size={14} /> {matchedFlow}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-charcoal-400">
      <AlertCircle size={14} /> No active flow targets this stage
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EmailStageAttribution({ onNavigateToJourney }: { onNavigateToJourney?: () => void }) {
  const [transitions, setTransitions] = useState<RealTransition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/customer-stage-history')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setTransitions(d.transitions ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner label="Loading stage transitions…" />

  return (
    <div>
      <p className="text-sm text-charcoal-400 mb-6 max-w-2xl">
        For each lifecycle stage recovery (e.g. Winback → Active), this shows which flow — if any — was likely
        associated with it. The connective feature between Email Performance and the Customer Intelligence lifecycle
        board.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {transitions.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">Real transitions</p>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden divide-y divide-sand-200">
            {transitions.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="text-sm text-charcoal-400 w-28 flex-shrink-0">{formatDate(t.changedAt)}</span>
                <span className="text-sm text-charcoal-700 font-medium">Customer #{t.customerId}</span>
                <span className="flex items-center gap-2">
                  {t.oldStage && <StagePill stage={t.oldStage} />}
                  <ArrowRight size={13} className="text-charcoal-300" />
                  <StagePill stage={t.newStage} />
                </span>
                <span className="ml-auto"><FlowMatch matchedFlow={t.matchedFlow} /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {transitions.length === 0 && (
        <div className="flex items-start gap-3 bg-sand-100 border border-sand-300 rounded-2xl p-5 mb-8">
          <AlertCircle size={16} className="text-charcoal-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-charcoal-500 leading-relaxed">
            <p className="mb-2">
              No real stage transitions recorded yet — this fills in as customers move between lifecycle stages and
              "Sync Stages to Omnisend" runs in Customer Journey.
            </p>
            {onNavigateToJourney && (
              <button
                onClick={onNavigateToJourney}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-terracotta-600 hover:text-terracotta-700 transition-colors"
              >
                Go to Customer Journey <ExternalLink size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">Illustrative examples</p>
        <div className="bg-white rounded-2xl shadow-card overflow-hidden divide-y divide-sand-200">
          {ILLUSTRATIVE_ATTRIBUTION_EXAMPLES.map((ex, i) => (
            <div key={i} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <span className="text-sm text-charcoal-400 w-28 flex-shrink-0">{ex.changedAtLabel}</span>
                <span className="text-sm text-charcoal-700 font-medium">{ex.customerLabel}</span>
                <span className="flex items-center gap-2">
                  <StagePill stage={ex.oldStage} />
                  <ArrowRight size={13} className="text-charcoal-300" />
                  <StagePill stage={ex.newStage} />
                </span>
                <span className="ml-auto"><FlowMatch matchedFlow={ex.matchedFlow} /></span>
              </div>
              <p className="text-xs text-charcoal-400 leading-relaxed">{ex.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

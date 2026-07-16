'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { PENDING_WORK, PENDING_WORK_AREAS, STATUS_META, type PendingWorkItem } from '@/lib/pending-work'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function PendingWorkCard({
  item,
  blockerTitle,
  done,
  toggling,
  onToggle,
}: {
  item: PendingWorkItem
  blockerTitle?: string
  done: boolean
  toggling: boolean
  onToggle: () => void
}) {
  const status = STATUS_META[item.status]
  return (
    <div className={`bg-white rounded-2xl shadow-card p-5 transition-opacity ${done ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          <button
            onClick={onToggle}
            disabled={toggling}
            title={done ? 'Mark as not done' : 'Mark as done'}
            className="flex-shrink-0 mt-0.5 text-olive-500 hover:text-olive-600 disabled:opacity-50 transition-colors"
          >
            {toggling ? (
              <Loader2 size={18} className="animate-spin" />
            ) : done ? (
              <CheckCircle2 size={18} />
            ) : (
              <Circle size={18} className="text-charcoal-300" />
            )}
          </button>
          <h4 className={`font-medium text-charcoal-700 ${done ? 'line-through' : ''}`}>{item.title}</h4>
        </div>
        <span
          className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
            done ? 'bg-olive-100 text-olive-600 border-olive-200' : `${status.bg} ${status.text} ${status.border}`
          }`}
        >
          {done ? 'Done' : status.label}
        </span>
      </div>

      <p className="text-sm text-charcoal-500 leading-relaxed mb-3">{item.summary}</p>

      {blockerTitle && !done && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mb-3">
          <AlertTriangle size={12} className="flex-shrink-0" />
          Blocked by: {blockerTitle}
        </p>
      )}

      <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-2">How to finish this</p>
      <ol className="list-decimal list-outside pl-4 space-y-1.5 text-sm text-charcoal-600 mb-3">
        {item.instructions.map((step, i) => (
          <li key={i} className="leading-relaxed">{step}</li>
        ))}
      </ol>

      {item.relatedFiles && item.relatedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-sand-100">
          {item.relatedFiles.map((f) => (
            <code key={f} className="text-[11px] px-1.5 py-0.5 rounded bg-sand-100 text-charcoal-500">{f}</code>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PendingWork() {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    fetch('/api/pending-work')
      .then((r) => r.json())
      .then((d) => setDoneIds(new Set(d.doneIds ?? [])))
      .finally(() => setLoading(false))
  }, [])

  async function toggleDone(id: string) {
    const nextDone = !doneIds.has(id)
    setTogglingId(id)
    setDoneIds((prev) => {
      const next = new Set(prev)
      nextDone ? next.add(id) : next.delete(id)
      return next
    })
    try {
      await fetch('/api/pending-work', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, done: nextDone }),
      })
    } finally {
      setTogglingId(null)
    }
  }

  const byId = new Map(PENDING_WORK.map((item) => [item.id, item]))
  const completedCount = PENDING_WORK.filter((item) => doneIds.has(item.id)).length

  return (
    <section className="max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Pending Work</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">
            What's built but not yet finished — deployment steps, unverified integrations, and missing permissions,
            with exact instructions for each.
          </p>
        </div>
        {completedCount > 0 && (
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex-shrink-0 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-terracotta-100"
          >
            {showCompleted ? 'Hide' : 'Show'} completed ({completedCount})
          </button>
        )}
      </div>

      {loading && <LoadingSpinner label="Loading…" />}

      {!loading && (
        <div className="space-y-10">
          {PENDING_WORK_AREAS.map((area) => {
            const items = PENDING_WORK.filter(
              (item) => item.area === area && (showCompleted || !doneIds.has(item.id))
            )
            if (items.length === 0) return null
            return (
              <div key={area}>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">{area}</h3>
                <div className="space-y-4">
                  {items.map((item) => (
                    <PendingWorkCard
                      key={item.id}
                      item={item}
                      blockerTitle={item.blockedBy ? byId.get(item.blockedBy)?.title : undefined}
                      done={doneIds.has(item.id)}
                      toggling={togglingId === item.id}
                      onToggle={() => toggleDone(item.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

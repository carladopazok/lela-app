'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { computeRFM, SEGMENT_META, SEGMENT_ORDER, BUYER_SEGMENT_ORDER } from '@/lib/rfm'
import TagBadge from '@/components/ui/TagBadge'
import MaskedEmail, { HideAllEmailsButton } from '@/components/ui/MaskedEmail'
import type { EnrichedCustomer } from '@/types'
import type { RFMSegment, ScoredCustomer } from '@/lib/rfm'

function formatDate(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ScorePip({ label, score, classes }: { label: string; score: number; classes: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${classes}`}>
        {score}
      </span>
      <span className="text-[9px] text-charcoal-400 leading-none">{label}</span>
    </span>
  )
}

function SegmentBadge({ segment }: { segment: RFMSegment }) {
  const m = SEGMENT_META[segment]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.text} border ${m.border} whitespace-nowrap`}>
      {segment}
    </span>
  )
}

function CategoryBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
      <span className="text-[9px] opacity-60">cat</span>{tag}
    </span>
  )
}

export default function RFMAnalysis({
  customers,
  onNavigateToJourney,
}: {
  customers: EnrichedCustomer[]
  onNavigateToJourney?: () => void
}) {
  const [selectedSegment, setSelectedSegment] = useState<RFMSegment | null>(null)
  const [hiddenEmailIds, setHiddenEmailIds] = useState<Set<number>>(new Set())

  function toggleEmailVisibility(id: number) {
    setHiddenEmailIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allEmailsHidden = customers.length > 0 && customers.every((c) => hiddenEmailIds.has(c.id))
  function toggleAllEmails() {
    setHiddenEmailIds(allEmailsHidden ? new Set() : new Set(customers.map((c) => c.id)))
  }

  const scored: ScoredCustomer[] = useMemo(() => computeRFM(customers), [customers])

  const counts = useMemo(() => {
    const map = new Map<RFMSegment, number>()
    for (const s of SEGMENT_ORDER) map.set(s, 0)
    for (const c of scored) map.set(c.segment, (map.get(c.segment) ?? 0) + 1)
    return map
  }, [scored])

  const total = customers.length
  const neverPurchasedCount = counts.get('Never Purchased') ?? 0
  const buyerTotal = total - neverPurchasedCount

  const displayList = useMemo(
    () => (selectedSegment ? scored.filter((c) => c.segment === selectedSegment) : scored)
      .slice()
      .sort((a, b) => (b.rfm.r + b.rfm.f + b.rfm.m) - (a.rfm.r + a.rfm.f + a.rfm.m)),
    [scored, selectedSegment],
  )

  // tag frequency per segment (behavioral + product category tags)
  const tagsBySegment = useMemo(() => {
    const map = new Map<RFMSegment, Map<string, number>>()
    for (const s of SEGMENT_ORDER) map.set(s, new Map())
    for (const c of scored) {
      const segMap = map.get(c.segment)!
      for (const tag of [...c.computedTags, ...c.manualTags, ...c.productTags]) {
        segMap.set(tag, (segMap.get(tag) ?? 0) + 1)
      }
    }
    return map
  }, [scored])

  // 5×5 grid: grid[r-1][f-1] = { count, segment } (buyers only). segment is the
  // dominant real segment among customers actually landing in that R×F cell — cell
  // color reflects real data, not an independent r/f classification rule.
  const grid = useMemo(() => {
    const g: { count: number; segment: RFMSegment | null }[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => ({ count: 0, segment: null as RFMSegment | null }))
    )
    const segCountsByCell = new Map<string, Map<RFMSegment, number>>()
    for (const c of scored) {
      if (c.orders_count === 0) continue
      const key = `${c.rfm.r}-${c.rfm.f}`
      const segCounts = segCountsByCell.get(key) ?? new Map<RFMSegment, number>()
      segCounts.set(c.segment, (segCounts.get(c.segment) ?? 0) + 1)
      segCountsByCell.set(key, segCounts)
      g[c.rfm.r - 1][c.rfm.f - 1].count++
    }
    for (const [key, segCounts] of segCountsByCell) {
      const [r, f] = key.split('-').map(Number)
      const dominant = [...segCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      g[r - 1][f - 1].segment = dominant
    }
    return g
  }, [scored])

  const toggle = (seg: RFMSegment) => setSelectedSegment((prev) => (prev === seg ? null : seg))

  return (
    <div className="space-y-6">
      {/* ── Cohort distribution bar ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400">
            Cohort Distribution — {buyerTotal} purchasing customers
          </p>
          {neverPurchasedCount > 0 && (
            <button
              onClick={onNavigateToJourney}
              className="text-xs text-charcoal-400 hover:text-terracotta-500 transition-colors"
            >
              + {neverPurchasedCount} never purchased → see Journey
            </button>
          )}
        </div>
        <div className="flex h-10 rounded-xl overflow-hidden gap-px">
          {BUYER_SEGMENT_ORDER.map((seg) => {
            const count = counts.get(seg) ?? 0
            if (count === 0) return null
            const pct = buyerTotal > 0 ? (count / buyerTotal) * 100 : 0
            const meta = SEGMENT_META[seg]
            return (
              <button
                key={seg}
                onClick={() => toggle(seg)}
                style={{ width: `${pct}%`, backgroundColor: meta.hex }}
                className={`flex items-center justify-center text-white text-xs font-semibold transition-opacity hover:opacity-80 min-w-0 overflow-hidden
                  ${selectedSegment === seg ? 'ring-2 ring-inset ring-white/60' : ''}`}
                title={`${seg}: ${count} (${pct.toFixed(0)}%)`}
              >
                {pct > 9 ? count : ''}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
          {BUYER_SEGMENT_ORDER.map((seg) => {
            const count = counts.get(seg) ?? 0
            if (count === 0) return null
            const meta = SEGMENT_META[seg]
            return (
              <button key={seg} onClick={() => toggle(seg)} className="flex items-center gap-1.5 text-xs text-charcoal-500 hover:text-charcoal-700">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.hex }} />
                {seg} <span className="text-charcoal-400">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Segment cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {BUYER_SEGMENT_ORDER.map((seg) => {
          const count = counts.get(seg) ?? 0
          const pct = buyerTotal > 0 ? ((count / buyerTotal) * 100).toFixed(0) : '0'
          const meta = SEGMENT_META[seg]
          const isSelected = selectedSegment === seg
          const allProductTagsInSeg = new Set(
            scored.filter(c => c.segment === seg).flatMap(c => c.productTags)
          )
          const topTags = Array.from(tagsBySegment.get(seg)?.entries() ?? [])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([tag]) => tag)
          return (
            <button
              key={seg}
              onClick={() => toggle(seg)}
              className={`text-left rounded-xl p-4 border-2 transition-all ${meta.bg}
                ${isSelected ? `${meta.border}` : 'border-transparent hover:border-sand-200'}`}
            >
              <div className={`text-2xl font-bold ${meta.text}`}>{count}</div>
              <div className="text-[11px] text-charcoal-400 mb-2">{pct}% of customers</div>
              <div className={`text-xs font-semibold ${meta.text} mb-1`}>{seg}</div>
              <div className="text-[11px] text-charcoal-400 leading-relaxed mb-2">{meta.description}</div>
              <div className={`text-[11px] font-medium ${meta.text} opacity-80 mb-2`}>→ {meta.action}</div>
              {topTags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2 border-t border-black/5">
                  {topTags.map((tag) =>
                    allProductTagsInSeg.has(tag)
                      ? <CategoryBadge key={tag} tag={tag} />
                      : <TagBadge key={tag} tag={tag} />
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ── R × F Heatmap ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-1">
          Recency × Frequency Matrix
        </p>
        <p className="text-[11px] text-charcoal-400 mb-4">Each cell shows customer count. Colour = segment.</p>
        <div className="flex gap-3">
          {/* Y-axis label */}
          <div className="flex items-center justify-center w-5">
            <span
              className="text-[10px] text-charcoal-400 whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Recency ↑
            </span>
          </div>

          <div className="flex-1">
            {/* Column headers */}
            <div className="grid grid-cols-5 gap-1.5 mb-1.5 ml-8">
              {[1, 2, 3, 4, 5].map((f) => (
                <div key={f} className="text-center text-[10px] text-charcoal-400">F{f}</div>
              ))}
            </div>

            {/* Rows R5 → R1 */}
            {[5, 4, 3, 2, 1].map((r) => (
              <div key={r} className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-charcoal-400 w-6 shrink-0 text-right">R{r}</span>
                <div className="grid grid-cols-5 gap-1.5 flex-1">
                  {[1, 2, 3, 4, 5].map((f) => {
                    const cell = grid[r - 1][f - 1]
                    const { count, segment: seg } = cell
                    const meta = seg ? SEGMENT_META[seg] : null
                    return (
                      <button
                        key={f}
                        onClick={() => count > 0 && seg && toggle(seg)}
                        title={`R${r} × F${f} · ${count} customer${count !== 1 ? 's' : ''}${seg ? ` · mostly ${seg}` : ''}`}
                        className={`h-10 rounded-lg flex items-center justify-center text-sm font-bold border transition-all
                          ${count > 0 && meta
                            ? `${meta.bg} ${meta.text} ${meta.border} hover:opacity-80 cursor-pointer`
                            : 'bg-sand-50 border-sand-100 text-charcoal-200 cursor-default'}`}
                      >
                        {count > 0 ? count : '·'}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* X-axis label */}
            <div className="flex justify-between text-[10px] text-charcoal-400 mt-1 ml-8">
              <span>← Infrequent</span>
              <span>Frequent →</span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-sand-100">
          {(['Champions', 'Loyal', 'Potential Loyalists', 'Needs Attention', 'At Risk', 'Lost'] as RFMSegment[]).map((seg) => {
            const meta = SEGMENT_META[seg]
            return (
              <span key={seg} className="flex items-center gap-1 text-[10px] text-charcoal-500">
                <span className={`w-3 h-3 rounded ${meta.bg} border ${meta.border}`} />
                {seg}
              </span>
            )
          })}
        </div>
      </div>

      {/* ── Customer list ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-sand-100 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400">
            {selectedSegment
              ? `${selectedSegment} · ${displayList.length} customer${displayList.length !== 1 ? 's' : ''}`
              : `All Customers · ${total}`}
          </p>
          <div className="flex items-center gap-3">
            <HideAllEmailsButton allHidden={allEmailsHidden} onClick={toggleAllEmails} />
            {selectedSegment && (
              <button
                onClick={() => setSelectedSegment(null)}
                className="flex items-center gap-1 text-xs text-charcoal-400 hover:text-charcoal-600"
              >
                <X size={12} /> Clear filter
              </button>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sand-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Customer</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">R · F · M</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Segment</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Tags</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Spent</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Orders</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Last Order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-100">
            {displayList.map((c) => (
              <tr key={c.id} className="hover:bg-cream-50 transition-colors">
                <td className="px-5 py-3">
                  <p className="font-medium text-charcoal-700">{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-charcoal-400 mt-0.5">
                    <MaskedEmail
                      email={c.email}
                      hidden={hiddenEmailIds.has(c.id)}
                      onToggle={() => toggleEmailVisibility(c.id)}
                    />
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-end gap-2">
                    <ScorePip label="R" score={c.rfm.r} classes="bg-purple-100 text-purple-700" />
                    <ScorePip label="F" score={c.rfm.f} classes="bg-olive-100 text-olive-700" />
                    <ScorePip label="M" score={c.rfm.m} classes="bg-terracotta-100 text-terracotta-700" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <SegmentBadge segment={c.segment} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {[...c.computedTags, ...c.manualTags].map((tag) => <TagBadge key={tag} tag={tag} />)}
                    {c.productTags.map((tag) => <CategoryBadge key={`cat-${tag}`} tag={tag} />)}
                    {c.computedTags.length === 0 && c.manualTags.length === 0 && c.productTags.length === 0 && (
                      <span className="text-xs text-charcoal-300">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-charcoal-700 font-medium">
                  €{parseFloat(c.total_spent).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-charcoal-700">{c.orders_count}</td>
                <td className="px-4 py-3 text-charcoal-500">{formatDate(c.lastOrderDate)}</td>
              </tr>
            ))}
            {displayList.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-charcoal-400">
                  No customers in this segment yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

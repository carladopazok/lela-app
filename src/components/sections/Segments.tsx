'use client'

import { useMemo, useState } from 'react'
import { X, ChevronDown, Folder } from 'lucide-react'
import { computeRFM, SEGMENT_ORDER, SEGMENT_META } from '@/lib/rfm'
import type { RFMSegment } from '@/lib/rfm'
import type { EnrichedCustomer } from '@/types'
import { CUSTOMER_TAGS } from '@/types'

function formatDate(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

type SegmentType = 'category' | 'cohort' | 'tag'
interface Selection { type: SegmentType; value: string }

const CATEGORY_STYLE = { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-400' }

const TAG_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  VIP:               { bg: 'bg-terracotta-50', text: 'text-terracotta-700', border: 'border-terracotta-400' },
  '1-order':         { bg: 'bg-olive-50',      text: 'text-olive-700',      border: 'border-olive-400' },
  'never-purchased': { bg: 'bg-sand-100',      text: 'text-charcoal-600',   border: 'border-sand-400' },
  winback:           { bg: 'bg-amber-50',      text: 'text-amber-700',      border: 'border-amber-400' },
}
const CUSTOM_TAG_STYLE = { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-400' }

function SegmentCard({
  label, count, total, style, isSelected, onClick,
}: {
  label: string
  count: number
  total: number
  style: { bg: string; text: string; border: string }
  isSelected: boolean
  onClick: () => void
}) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0'
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-4 border-2 ${style.bg} transition-all
        ${isSelected ? style.border : 'border-transparent hover:border-sand-200'}`}
    >
      <div className={`text-2xl font-bold ${style.text}`}>{count}</div>
      <div className="text-[11px] text-charcoal-400 mb-2">{pct}% of customers</div>
      <div className={`text-xs font-semibold ${style.text} capitalize`}>{label}</div>
    </button>
  )
}

function SegmentGroup({
  label, count, isOpen, onToggle, children,
}: {
  label: string
  count: number
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-sand-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-charcoal-400">
          <Folder size={13} className="text-charcoal-300" />
          {label}
          <span className="text-charcoal-300 font-normal normal-case">· {count}</span>
        </span>
        <ChevronDown size={14} className={`text-charcoal-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

export default function Segments({
  customers,
  customTagTypes,
}: {
  customers: EnrichedCustomer[]
  customTagTypes: string[]
}) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const [openGroups, setOpenGroups] = useState<Set<SegmentType>>(new Set())
  const total = customers.length

  function toggleGroup(type: SegmentType) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  function toggle(type: SegmentType, value: string) {
    setSelected((prev) => (prev && prev.type === type && prev.value === value ? null : { type, value }))
  }

  // ── By product purchased ──────────────────────────────────────────────────
  const categories = useMemo(
    () => [...new Set(customers.flatMap((c) => c.productTags))].sort(),
    [customers],
  )
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const cat of categories) map.set(cat, 0)
    for (const c of customers) {
      for (const cat of c.productTags) map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return map
  }, [customers, categories])

  // ── By cohort (RFM) ────────────────────────────────────────────────────────
  const scored = useMemo(() => computeRFM(customers), [customers])
  const cohortCounts = useMemo(() => {
    const map = new Map<RFMSegment, number>()
    for (const s of SEGMENT_ORDER) map.set(s, 0)
    for (const c of scored) map.set(c.segment, (map.get(c.segment) ?? 0) + 1)
    return map
  }, [scored])

  // ── By customer tag ────────────────────────────────────────────────────────
  const allTagTypes = useMemo(() => [...CUSTOMER_TAGS, ...customTagTypes], [customTagTypes])
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const tag of allTagTypes) map.set(tag, 0)
    for (const c of customers) {
      for (const tag of [...c.computedTags, ...c.manualTags]) {
        map.set(tag, (map.get(tag) ?? 0) + 1)
      }
    }
    return map
  }, [customers, allTagTypes])

  const displayList = useMemo(() => {
    let base = customers
    if (selected) {
      if (selected.type === 'category') {
        base = customers.filter((c) => c.productTags.includes(selected.value))
      } else if (selected.type === 'tag') {
        base = customers.filter((c) => [...c.computedTags, ...c.manualTags].includes(selected.value))
      } else {
        const idsInCohort = new Set(scored.filter((s) => s.segment === selected.value).map((s) => s.id))
        base = customers.filter((c) => idsInCohort.has(c.id))
      }
    }
    return base.slice().sort((a, b) => parseFloat(b.total_spent) - parseFloat(a.total_spent))
  }, [customers, selected, scored])

  return (
    <div className="space-y-6">
      {/* By product purchased */}
      <SegmentGroup
        label="By Product Purchased"
        count={categories.length}
        isOpen={openGroups.has('category')}
        onToggle={() => toggleGroup('category')}
      >
        {categories.length === 0 ? (
          <p className="text-xs text-charcoal-300 italic">No product categories yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {categories.map((cat) => (
              <SegmentCard
                key={cat}
                label={cat}
                count={categoryCounts.get(cat) ?? 0}
                total={total}
                style={CATEGORY_STYLE}
                isSelected={selected?.type === 'category' && selected.value === cat}
                onClick={() => toggle('category', cat)}
              />
            ))}
          </div>
        )}
      </SegmentGroup>

      {/* By cohort */}
      <SegmentGroup
        label="By Cohort"
        count={Array.from(cohortCounts.values()).filter((n) => n > 0).length}
        isOpen={openGroups.has('cohort')}
        onToggle={() => toggleGroup('cohort')}
      >
        <div className="grid grid-cols-4 gap-3">
          {SEGMENT_ORDER.map((seg) => {
            const meta = SEGMENT_META[seg]
            const count = cohortCounts.get(seg) ?? 0
            if (count === 0) return null
            return (
              <SegmentCard
                key={seg}
                label={seg}
                count={count}
                total={total}
                style={meta}
                isSelected={selected?.type === 'cohort' && selected.value === seg}
                onClick={() => toggle('cohort', seg)}
              />
            )
          })}
        </div>
      </SegmentGroup>

      {/* By customer tag */}
      <SegmentGroup
        label="By Customer Tag"
        count={Array.from(tagCounts.values()).filter((n) => n > 0).length}
        isOpen={openGroups.has('tag')}
        onToggle={() => toggleGroup('tag')}
      >
        <div className="grid grid-cols-4 gap-3">
          {allTagTypes.map((tag) => {
            const count = tagCounts.get(tag) ?? 0
            if (count === 0) return null
            return (
              <SegmentCard
                key={tag}
                label={tag}
                count={count}
                total={total}
                style={TAG_STYLES[tag] ?? CUSTOM_TAG_STYLE}
                isSelected={selected?.type === 'tag' && selected.value === tag}
                onClick={() => toggle('tag', tag)}
              />
            )
          })}
        </div>
      </SegmentGroup>

      {/* Customer list */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-sand-100 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400">
            {selected
              ? `${selected.value} · ${displayList.length} customer${displayList.length !== 1 ? 's' : ''}`
              : `All Customers · ${total}`}
          </p>
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-xs text-charcoal-400 hover:text-charcoal-600"
            >
              <X size={12} /> Clear filter
            </button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sand-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Customer</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Categories</th>
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
                  <p className="text-xs text-charcoal-400 mt-0.5">{c.email}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.productTags.length > 0
                      ? c.productTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 capitalize"
                          >
                            {tag}
                          </span>
                        ))
                      : <span className="text-xs text-charcoal-300">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-charcoal-700 font-medium">€{parseFloat(c.total_spent).toFixed(2)}</td>
                <td className="px-4 py-3 text-charcoal-700">{c.orders_count}</td>
                <td className="px-4 py-3 text-charcoal-500">{formatDate(c.lastOrderDate)}</td>
              </tr>
            ))}
            {displayList.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-charcoal-400">
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

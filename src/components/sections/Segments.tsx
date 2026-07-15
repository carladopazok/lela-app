'use client'

import { useMemo, useState } from 'react'
import { X, Folder, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { computeRFM, SEGMENT_ORDER, SEGMENT_META } from '@/lib/rfm'
import type { RFMSegment } from '@/lib/rfm'
import MaskedEmail, { HideAllEmailsButton } from '@/components/ui/MaskedEmail'
import CollapsibleCard from '@/components/ui/CollapsibleCard'
import type { EnrichedCustomer } from '@/types'
import { CUSTOMER_TAGS } from '@/types'

function formatDate(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

type SegmentType = 'category' | 'cohort' | 'tag' | 'country'
interface Selection { type: SegmentType; value: string }

const GROUP_LABELS: Record<SegmentType, string> = {
  category: 'Category',
  cohort: 'Cohort',
  tag: 'Tag',
  country: 'Country',
}

// Matches the `lela-<rawTag>` convention already pushed by the customer tag sync
// in CustomerIntelligence.tsx, so a segment here matches real synced contacts.
function rawTagForSelection(sel: Selection): string {
  if (sel.type === 'category') return `category-${sel.value}`
  if (sel.type === 'cohort') return `cohort-${sel.value}`
  if (sel.type === 'country') return `country-${sel.value}`
  return sel.value
}

function matchesSelection(c: EnrichedCustomer, sel: Selection, cohortById: Map<number, RFMSegment>): boolean {
  if (sel.type === 'category') return c.productTags.includes(sel.value)
  if (sel.type === 'tag') return [...c.computedTags, ...c.manualTags].includes(sel.value)
  if (sel.type === 'country') return c.country === sel.value
  return cohortById.get(c.id) === sel.value
}

const CATEGORY_STYLE = { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-400' }
const COUNTRY_STYLE = { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-400' }

const TAG_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  VIP:               { bg: 'bg-green-50',      text: 'text-green-700',      border: 'border-green-400' },
  loyal:             { bg: 'bg-teal-50',       text: 'text-teal-700',       border: 'border-teal-400' },
  '1-order':         { bg: 'bg-charcoal-100',  text: 'text-charcoal-900',   border: 'border-charcoal-500' },
  'never-purchased': { bg: 'bg-sand-100',      text: 'text-charcoal-600',   border: 'border-sand-400' },
  winback:           { bg: 'bg-orange-50',     text: 'text-orange-700',     border: 'border-orange-400' },
  'at-risk':         { bg: 'bg-amber-50',      text: 'text-amber-700',      border: 'border-amber-400' },
  lapsed:            { bg: 'bg-red-50',        text: 'text-red-600',        border: 'border-red-400' },
  lost:              { bg: 'bg-sand-100',      text: 'text-charcoal-700',   border: 'border-charcoal-400' },
  'abandoned-checkout': { bg: 'bg-red-50',     text: 'text-red-600',        border: 'border-red-400' },
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

const FOLDER_ICON = <Folder size={13} className="text-charcoal-300" />

export default function Segments({
  customers,
  customTagTypes,
}: {
  customers: EnrichedCustomer[]
  customTagTypes: string[]
}) {
  const [selectedSegments, setSelectedSegments] = useState<Selection[]>([])
  const [openGroups, setOpenGroups] = useState<Set<SegmentType>>(new Set())
  const [creatingSegment, setCreatingSegment] = useState(false)
  const [segmentResult, setSegmentResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [hiddenEmailIds, setHiddenEmailIds] = useState<Set<number>>(new Set())
  const total = customers.length

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

  function toggleGroup(type: SegmentType) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  function isSelected(type: SegmentType, value: string) {
    return selectedSegments.some((s) => s.type === type && s.value === value)
  }

  function toggle(type: SegmentType, value: string) {
    setSegmentResult(null)
    setSelectedSegments((prev) =>
      prev.some((s) => s.type === type && s.value === value)
        ? prev.filter((s) => !(s.type === type && s.value === value))
        : [...prev, { type, value }]
    )
  }

  async function createOmnisendSegment() {
    if (selectedSegments.length === 0) return
    setCreatingSegment(true)
    setSegmentResult(null)
    try {
      const name = `Lela: ${selectedSegments.map((s) => `${GROUP_LABELS[s.type]} — ${s.value}`).join(' + ')}`
      const tags = selectedSegments.map((s) => `lela-${rawTagForSelection(s)}`)
      const res = await fetch('/api/omnisend/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tags }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create segment')
      setSegmentResult({
        ok: true,
        message: data.alreadyExisted ? 'Segment already exists in Omnisend' : 'Segment created in Omnisend',
      })
    } catch (e) {
      setSegmentResult({ ok: false, message: e instanceof Error ? e.message : 'Failed to create segment' })
    } finally {
      setCreatingSegment(false)
    }
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

  // ── By country ─────────────────────────────────────────────────────────────
  const countries = useMemo(
    () => [...new Set(customers.map((c) => c.country).filter((v): v is string => Boolean(v)))].sort(),
    [customers],
  )
  const countryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const country of countries) map.set(country, 0)
    for (const c of customers) {
      if (c.country) map.set(c.country, (map.get(c.country) ?? 0) + 1)
    }
    return map
  }, [customers, countries])

  // ── By cohort (RFM) ────────────────────────────────────────────────────────
  const scored = useMemo(() => computeRFM(customers), [customers])
  const cohortById = useMemo(() => new Map(scored.map((s) => [s.id, s.segment])), [scored])
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
    const base = selectedSegments.length === 0
      ? customers
      : customers.filter((c) => selectedSegments.every((sel) => matchesSelection(c, sel, cohortById)))
    return base.slice().sort((a, b) => parseFloat(b.total_spent) - parseFloat(a.total_spent))
  }, [customers, selectedSegments, cohortById])

  return (
    <div className="space-y-6">
      {/* By product purchased */}
      <CollapsibleCard icon={FOLDER_ICON}
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
                isSelected={isSelected('category', cat)}
                onClick={() => toggle('category', cat)}
              />
            ))}
          </div>
        )}
      </CollapsibleCard>

      {/* By country */}
      <CollapsibleCard icon={FOLDER_ICON}
        label="By Country"
        count={countries.length}
        isOpen={openGroups.has('country')}
        onToggle={() => toggleGroup('country')}
      >
        {countries.length === 0 ? (
          <p className="text-xs text-charcoal-300 italic">No country data yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {countries.map((country) => (
              <SegmentCard
                key={country}
                label={country}
                count={countryCounts.get(country) ?? 0}
                total={total}
                style={COUNTRY_STYLE}
                isSelected={isSelected('country', country)}
                onClick={() => toggle('country', country)}
              />
            ))}
          </div>
        )}
      </CollapsibleCard>

      {/* By cohort */}
      <CollapsibleCard icon={FOLDER_ICON}
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
                isSelected={isSelected('cohort', seg)}
                onClick={() => toggle('cohort', seg)}
              />
            )
          })}
        </div>
      </CollapsibleCard>

      {/* By customer tag */}
      <CollapsibleCard icon={FOLDER_ICON}
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
                isSelected={isSelected('tag', tag)}
                onClick={() => toggle('tag', tag)}
              />
            )
          })}
        </div>
      </CollapsibleCard>

      {/* Customer list */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-sand-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400">
              {selectedSegments.length > 0
                ? `${displayList.length} customer${displayList.length !== 1 ? 's' : ''}`
                : `All Customers · ${total}`}
            </p>
            {selectedSegments.map((sel) => (
              <span
                key={`${sel.type}-${sel.value}`}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-sand-100 text-charcoal-600 border border-sand-300"
              >
                {GROUP_LABELS[sel.type]}: {sel.value}
                <button
                  onClick={() => toggle(sel.type, sel.value)}
                  className="p-0.5 opacity-60 hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <HideAllEmailsButton allHidden={allEmailsHidden} onClick={toggleAllEmails} />
            {selectedSegments.length > 0 && (
              <>
                {segmentResult && (
                  <span className={`flex items-center gap-1 text-xs ${segmentResult.ok ? 'text-olive-600' : 'text-red-500'}`}>
                    {segmentResult.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                    {segmentResult.message}
                  </span>
                )}
                <button
                  onClick={createOmnisendSegment}
                  disabled={creatingSegment}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-olive-500 hover:bg-olive-600 text-white transition-colors disabled:opacity-60"
                >
                  {creatingSegment ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Create Omnisend Segment
                </button>
                <button
                  onClick={() => setSelectedSegments([])}
                  className="flex items-center gap-1 text-xs text-charcoal-400 hover:text-charcoal-600"
                >
                  <X size={12} /> Clear all
                </button>
              </>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sand-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Customer</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Country</th>
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
                  <p className="text-xs text-charcoal-400 mt-0.5">
                    <MaskedEmail
                      email={c.email}
                      hidden={hiddenEmailIds.has(c.id)}
                      onToggle={() => toggleEmailVisibility(c.id)}
                    />
                  </p>
                </td>
                <td className="px-4 py-3">
                  {c.country ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                      {c.country}
                    </span>
                  ) : (
                    <span className="text-xs text-charcoal-300">—</span>
                  )}
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
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-charcoal-400">
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

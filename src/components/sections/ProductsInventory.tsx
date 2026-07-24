'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, AlertCircle, Package, Check, X, Info, Boxes, XCircle, Clock, Mail, Loader2,
  Pencil, Search, ChevronDown, Megaphone, ArrowUp, ArrowDown, ArrowUpDown, ArrowLeft, Users,
  AlertTriangle,
} from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import { STALLED_DAYS, daysSince, isStalled, isSoldOutLive, getStalledUnitsSummary } from '@/lib/product-metrics'
import type { ProductSummary, RelatedProductsData, InterestedCustomersResponse, RelatedProductEntry, BackInStockResponse } from '@/types'

type ActiveFilter = 'all' | 'soldout' | 'stalled' | 'returnrisk'
type ProductSortKey = 'name' | 'bestselling' | 'margin' | 'daysStalled' | 'onhand' | 'price' | 'status'
type SortDir = 'asc' | 'desc'
type StatusBadge = 'bestseller' | 'soldout' | 'stalled' | null

const STATUS_RANK: Record<'bestseller' | 'soldout' | 'stalled' | 'none', number> = {
  bestseller: 0, soldout: 1, stalled: 2, none: 3,
}

const LOW_STOCK_THRESHOLD = 3
const DISCOUNT_OPTIONS = [0, 0.2, 0.4, 0.6] as const

function fmt(n: number, currency: string, locale: string) {
  try {
    return n.toLocaleString(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } catch {
    // Malformed locale from the store (or currency the runtime doesn't recognize) — fall back
    // rather than throwing, so a formatting quirk never blanks out the whole page.
    return n.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// A product with no sale yet isn't automatically "stalled" — it's only stalled once it's actually
// been available long enough to judge. Falls back from last-sold date to when it went live
// (published_at), then to when it was created, rather than treating "never sold" as an instant,
// threshold-proof flag.
function daysStalledFor(p: ProductSummary): number {
  const reference = p.lastSoldAt ?? p.publishedAt ?? p.createdAt
  return reference ? daysSince(reference) : 0
}

// Per-unit margin at a given price vs. a given cost — null when either is missing.
function marginAt(price: number | null, cost: number | null): { amount: number; percent: number } | null {
  if (price == null || cost == null || price === 0) return null
  const amount = price - cost
  return { amount, percent: (amount / price) * 100 }
}

function MarginLabel({
  margin,
  currency,
  locale,
}: {
  margin: { amount: number; percent: number } | null
  currency: string
  locale: string
}) {
  if (!margin) return <span className="text-xs text-charcoal-300">—</span>
  const negative = margin.amount < 0
  return (
    <span className={`text-xs font-medium ${negative ? 'text-red-600' : 'text-olive-600'}`}>
      {fmt(margin.amount, currency, locale)} ({margin.percent.toFixed(0)}%){negative && ' ⚠️'}
    </span>
  )
}

const ZEBRA_ROW_CLASSES = [
  'bg-gradient-to-r from-white via-sand-50 to-sand-100',
  'bg-gradient-to-r from-cream-100 via-cream-50 to-white',
]

function zebraClass(i: number): string {
  return ZEBRA_ROW_CLASSES[i % ZEBRA_ROW_CLASSES.length]
}

// Applied to a <table> to additionally band alternating columns, layered on top of the
// per-row gradient above — gives a spreadsheet-style grid instead of just horizontal stripes.
const COLUMN_BAND_CLASS = '[&_tbody_td:nth-child(even)]:bg-charcoal-900/[0.06]'

function reorderMailto(p: ProductSummary): string {
  const subject = encodeURIComponent(`Reorder request: ${p.title}`)
  const body = encodeURIComponent(
    `Product: ${p.title}\nVendor: ${p.vendor || '—'}\nCategory: ${p.category || '—'}\nCurrent stock: ${p.inventoryQuantity ?? 0} units\n\nPlease reorder more stock for this product.`
  )
  return `mailto:?subject=${subject}&body=${body}`
}

function ProductThumb({ imageUrl, title }: { imageUrl: string | null; title: string }) {
  return imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl} alt={title} className="w-9 h-9 rounded object-cover shrink-0 border border-sand-200" />
  ) : (
    <div className="w-9 h-9 rounded bg-sand-100 border border-sand-200 shrink-0 flex items-center justify-center">
      <Package size={14} className="text-charcoal-300" />
    </div>
  )
}

function CategoryEditor({
  title,
  assignedCategory,
  onAssign,
}: {
  title: string
  assignedCategory: string | null
  onAssign: (title: string, category: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) { onAssign(title, value.trim()); setEditing(false); setValue('') }
            if (e.key === 'Escape') { setEditing(false); setValue('') }
          }}
          placeholder="e.g. Accessories"
          className="px-2 py-0.5 text-xs border border-indigo-300 rounded-full focus:outline-none w-28"
        />
        <button
          onClick={() => { if (value.trim()) { onAssign(title, value.trim()); setEditing(false); setValue('') } }}
          className="p-0.5 text-indigo-500"
        >
          <Check size={11} />
        </button>
        <button onClick={() => { setEditing(false); setValue('') }} className="p-0.5 text-charcoal-400">
          <X size={11} />
        </button>
      </div>
    )
  }

  if (assignedCategory) {
    return (
      <div className="flex items-center gap-1 group">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
          {assignedCategory}
        </span>
        <button
          onClick={() => { setEditing(true); setValue(assignedCategory) }}
          className="p-0.5 text-charcoal-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit category"
        >
          <Pencil size={10} />
        </button>
        <button
          onClick={() => onAssign(title, null)}
          className="p-0.5 text-charcoal-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove category"
        >
          <X size={10} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-[10px] text-charcoal-300 hover:text-indigo-500 border border-dashed border-charcoal-200 hover:border-indigo-300 px-1.5 py-0.5 rounded-full transition-colors"
    >
      + assign category
    </button>
  )
}

function CogsEditor({
  productId,
  sku,
  nativeValue,
  manualValue,
  currency,
  locale,
  onAssign,
}: {
  productId: number | null
  sku: string | null
  nativeValue: number | null
  manualValue: number | null
  currency: string
  locale: string
  onAssign: (productId: number, sku: string | null, cost: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  function commit() {
    if (productId == null) return
    const n = parseFloat(input)
    if (Number.isFinite(n) && n >= 0) { onAssign(productId, sku, n); setEditing(false); setInput('') }
  }

  // Native Shopify cost wins and isn't editable here — it's sourced from the product's
  // "Cost per item" field in Shopify admin, editing it in this app wouldn't sync back.
  if (nativeValue != null) {
    return (
      <span
        className="text-xs text-charcoal-600 whitespace-nowrap"
        title="Cost per item, synced from Shopify's product data — update it in Shopify admin to change this value"
      >
        {fmt(nativeValue, currency, locale)}/unit <span className="text-charcoal-300">· Shopify</span>
      </span>
    )
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 whitespace-nowrap">
        <input
          autoFocus
          type="number"
          step="0.01"
          min="0"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setEditing(false); setInput('') }
          }}
          placeholder="Cost/unit"
          className="px-2 py-0.5 text-xs border border-indigo-300 rounded-full focus:outline-none w-20"
        />
        <button onClick={commit} className="p-0.5 text-indigo-500">
          <Check size={11} />
        </button>
        <button onClick={() => { setEditing(false); setInput('') }} className="p-0.5 text-charcoal-400">
          <X size={11} />
        </button>
      </div>
    )
  }

  if (manualValue != null) {
    return (
      <div className="flex items-center gap-1 whitespace-nowrap group">
        <span className="text-xs text-charcoal-600" title="Manually entered cost">
          {fmt(manualValue, currency, locale)}/unit
        </span>
        <button
          onClick={() => { setEditing(true); setInput(String(manualValue)) }}
          className="p-0.5 text-charcoal-300 hover:text-charcoal-500 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit cost"
        >
          <Pencil size={10} />
        </button>
        <button
          onClick={() => productId != null && onAssign(productId, sku, null)}
          className="p-0.5 text-charcoal-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove cost"
        >
          <X size={10} />
        </button>
      </div>
    )
  }

  if (productId == null) {
    return <span className="text-xs text-charcoal-300">—</span>
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-[10px] text-charcoal-300 hover:text-indigo-500 border border-dashed border-charcoal-200 hover:border-indigo-300 px-1.5 py-0.5 rounded-full transition-colors"
    >
      + add cost
    </button>
  )
}

function KpiCard({
  label,
  value,
  sub,
  footnote,
  icon,
  active,
  onClick,
}: {
  label: string
  value: string
  sub?: string
  footnote?: string
  icon?: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-2xl shadow-card p-6 flex flex-col gap-1 transition-all
        ${active ? 'border-2 border-terracotta-400' : 'border border-sand-200 hover:border-sand-300'}`}
    >
      <p className="text-xs font-medium uppercase tracking-widest text-charcoal-400 flex items-center gap-1.5">
        {icon} {label}
      </p>
      <p className="text-3xl font-serif font-semibold tracking-tight text-charcoal-700">{value}</p>
      {sub && <p className="text-xs text-charcoal-400 mt-0.5">{sub}</p>}
      {footnote && <p className="text-[11px] text-charcoal-300 italic mt-1">{footnote}</p>}
    </button>
  )
}

interface ResolvedRow {
  product: ProductSummary
  badge: StatusBadge
  isStalledRow: boolean
  isSoldOutLive: boolean
  category: string | null
  cost: number | null // final resolved cost (native Shopify cost wins over manual)
  manualCost: number | null // manually entered cost only, for the CogsEditor's editable state
  margin: { amount: number; percent: number } | null
  returnRate: number | null
  returnFlagged: boolean
}

const BADGE_STYLES: Record<Exclude<StatusBadge, null>, { label: string; className: string }> = {
  bestseller: { label: 'Best Seller', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  soldout: { label: 'Sold Out, Live', className: 'bg-red-50 text-red-600 border-red-200' },
  stalled: { label: 'Stalled', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

function StatusBadgePill({ badge }: { badge: StatusBadge }) {
  if (!badge) return null
  const { label, className } = BADGE_STYLES[badge]
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${className}`}>
      {label}
    </span>
  )
}

function SortableTh({
  label,
  sortKeyValue,
  activeKey,
  dir,
  onSort,
  align = 'right',
}: {
  label: string
  sortKeyValue: ProductSortKey
  activeKey: ProductSortKey
  dir: SortDir
  onSort: (key: ProductSortKey) => void
  align?: 'left' | 'right'
}) {
  const active = activeKey === sortKeyValue
  return (
    <th className={`pb-3 px-4 font-medium whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(sortKeyValue)}
        className={`inline-flex items-center gap-1 hover:text-charcoal-600 transition-colors ${active ? 'text-charcoal-600' : ''}`}
      >
        {label}
        {active
          ? dir === 'asc'
            ? <ArrowUp size={11} className="text-terracotta-500" />
            : <ArrowDown size={11} className="text-terracotta-500" />
          : <ArrowUpDown size={11} className="opacity-30" />}
      </button>
    </th>
  )
}

// ─── Stalled row expanded panel — related products, might-be-interested audience,
// discount/conversion simulator, create-campaign action. Local state per instance so
// multiple rows can be expanded independently without stepping on each other. ─────────
function StalledCampaignPanel({
  product,
  currency,
  locale,
  cost,
  relatedEntries,
  productsById,
  interestedData,
  interestedLoading,
  interestedError,
  onRecomputeRelated,
  recomputingRelated,
  relatedComputedAt,
  onCreateSegment,
}: {
  product: ProductSummary
  currency: string
  locale: string
  cost: number | null
  relatedEntries: RelatedProductEntry[]
  productsById: Map<string, ProductSummary>
  interestedData: InterestedCustomersResponse | null
  interestedLoading: boolean
  interestedError: string | null
  onRecomputeRelated: () => void
  recomputingRelated: boolean
  relatedComputedAt: string | null
  onCreateSegment: (product: ProductSummary, emails: string[]) => Promise<{ ok: boolean; message: string }>
}) {
  // All related-product chips start ON — an empty exclusion set reads as "everything included."
  const [excludedChips, setExcludedChips] = useState<Set<string>>(new Set())
  const [discount, setDiscount] = useState(0)
  const [customDiscountInput, setCustomDiscountInput] = useState('')
  const [conversionPercent, setConversionPercent] = useState(100)
  const [confirming, setConfirming] = useState(false)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function money(n: number) { return fmt(n, currency, locale) }
  function toggleChip(id: string) {
    setExcludedChips((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const audienceByChip = new Map((interestedData?.byRelatedProduct ?? []).map((e) => [e.relatedProductId, e.customerIds]))

  // Union of customer ids across every chip currently ON, deduplicated — a customer who
  // bought two selected related products counts once, not twice.
  const unionIds = useMemo(() => {
    const set = new Set<number>()
    for (const entry of interestedData?.byRelatedProduct ?? []) {
      if (excludedChips.has(entry.relatedProductId)) continue
      for (const id of entry.customerIds) set.add(id)
    }
    return set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interestedData, excludedChips])

  const K = unionIds.size
  const consentedEmails = [...unionIds].map((id) => interestedData?.customerEmails[id]).filter((e): e is string => !!e)

  const conversionRate = conversionPercent / 100
  const unitsOnHand = product.inventoryQuantity ?? 0
  const projectedBuyers = K * conversionRate
  const buyers = Math.min(projectedBuyers, unitsOnHand)
  const capped = projectedBuyers > unitsOnHand

  const discountedPrice = product.price != null ? product.price * (1 - discount) : null
  const discountedMargin = marginAt(discountedPrice, cost)
  const costBasisAtRisk = cost != null ? cost * unitsOnHand : null
  const potentialRevenue = discountedPrice != null ? discountedPrice * buyers : 0

  // Revenue range preview: buyers is discount-invariant, so the range is just revenue at the
  // two discount extremes (0% and 60%) using that same buyers figure — not tied to whichever
  // discount tier happens to be selected below.
  const revenueAt = (d: number) => (product.price != null ? product.price * (1 - d) * buyers : 0)
  const revenueEnds = [revenueAt(0), revenueAt(0.6)]
  const revenueLow = Math.min(...revenueEnds)
  const revenueHigh = Math.max(...revenueEnds)

  async function handleCreate() {
    setCreating(true)
    setResult(null)
    const outcome = await onCreateSegment(product, consentedEmails)
    setResult(outcome)
    if (outcome.ok) setConfirming(false)
    setCreating(false)
  }

  return (
    <div className="bg-sand-50 rounded-xl p-4 mt-2">
      {/* Related products — toggle chips */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400">Related Products</p>
        <button
          onClick={onRecomputeRelated}
          disabled={recomputingRelated}
          className="flex items-center gap-1.5 text-xs text-charcoal-400 hover:text-terracotta-500 transition-colors px-2 py-1 rounded-lg hover:bg-white disabled:opacity-50"
        >
          <RefreshCw size={11} className={recomputingRelated ? 'animate-spin' : ''} />
          Recompute {relatedComputedAt ? `(updated ${formatDate(relatedComputedAt)})` : ''}
        </button>
      </div>

      {interestedLoading ? (
        <p className="text-sm text-charcoal-400 mb-4">Loading audience…</p>
      ) : interestedError ? (
        <p className="text-sm text-red-600 mb-4">{interestedError}</p>
      ) : relatedEntries.length === 0 ? (
        <p className="text-sm text-charcoal-400 italic mb-4">No related products yet — try Recompute.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5 mb-5">
          {relatedEntries.map((entry) => {
            const rp = productsById.get(entry.relatedProductId)
            const on = !excludedChips.has(entry.relatedProductId)
            const count = audienceByChip.get(entry.relatedProductId)?.length ?? 0
            return (
              <li key={`${entry.relationType}-${entry.relatedProductId}`}>
                <button
                  onClick={() => toggleChip(entry.relatedProductId)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                    ${on ? 'border-terracotta-400 bg-terracotta-100/40 text-terracotta-700' : 'border-sand-300 text-charcoal-400'}`}
                  title={entry.relationType === 'same-tag' ? 'Same Tag' : `Frequently Bought Together ×${entry.coPurchaseCount}`}
                >
                  {rp?.title ?? `Product #${entry.relatedProductId}`} · {count}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Eligible audience — headline stat */}
      <div className="mb-4">
        <p className="text-3xl font-serif font-semibold text-charcoal-700">{K.toLocaleString()}</p>
        <p className="text-xs text-charcoal-400">
          eligible customers — bought a selected related product, have marketing consent, haven&apos;t bought this piece
        </p>
      </div>

      {capped && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Only {unitsOnHand} unit{unitsOnHand === 1 ? '' : 's'} on hand — projected buyers exceed supply, revenue is capped to
          what you can actually fulfil.
        </p>
      )}

      {K > 0 && (
        <p className="text-sm text-charcoal-600 mb-5">
          A campaign to these <span className="font-semibold text-charcoal-700">{K}</span> customers could generate{' '}
          <span className="font-semibold text-charcoal-700">{money(revenueLow)}</span> to{' '}
          <span className="font-semibold text-charcoal-700">{money(revenueHigh)}</span> depending on the discount you
          choose{capped ? `, limited by ${unitsOnHand} unit${unitsOnHand === 1 ? '' : 's'} on hand` : ''}.
        </p>
      )}

      {/* Discount tier selector */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-xs text-charcoal-400 whitespace-nowrap">Discount</span>
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl flex-wrap border border-sand-200">
          {DISCOUNT_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => { setDiscount(d); setCustomDiscountInput('') }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                ${discount === d && customDiscountInput === ''
                  ? 'bg-terracotta-500 text-white shadow-sm'
                  : 'text-charcoal-500 hover:text-charcoal-700'}`}
            >
              {d === 0 ? 'No Discount' : `${Math.round(d * 100)}% Off`}
            </button>
          ))}
          <div className={`flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-lg transition-all ${customDiscountInput !== '' ? 'bg-terracotta-500 shadow-sm' : ''}`}>
            <span className={`text-xs font-medium ${customDiscountInput !== '' ? 'text-white' : 'text-charcoal-500'}`}>Custom</span>
            <input
              type="number"
              min={0}
              max={95}
              placeholder="%"
              value={customDiscountInput}
              onChange={(e) => {
                const raw = e.target.value
                setCustomDiscountInput(raw)
                const v = parseFloat(raw)
                if (Number.isFinite(v)) setDiscount(Math.max(0, Math.min(95, v)) / 100)
              }}
              className={`w-11 px-1 py-0.5 text-xs rounded border-0 focus:outline-none focus:ring-1 focus:ring-terracotta-300
                ${customDiscountInput !== '' ? 'bg-terracotta-400 text-white placeholder-terracotta-100' : 'bg-white text-charcoal-700'}`}
            />
            <span className={`text-xs ${customDiscountInput !== '' ? 'text-white' : 'text-charcoal-400'}`}>%</span>
          </div>
        </div>
      </div>

      {/* Assumed conversion — single input, no historical-data helper text (none exists to reference) */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <span className="text-xs text-charcoal-400 whitespace-nowrap">Assumed conversion</span>
        <div className="flex items-center gap-1 bg-white border border-sand-300 rounded-lg px-2 py-1">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={conversionPercent}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (Number.isFinite(v)) setConversionPercent(Math.max(0, Math.min(100, v)))
            }}
            className="w-14 text-sm text-charcoal-700 focus:outline-none"
          />
          <span className="text-sm text-charcoal-400">%</span>
        </div>
      </div>

      {/* Five stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-5 pb-5 border-b border-sand-200">
        <div>
          <p className="text-xs text-charcoal-400">Price at Discount</p>
          <p className="text-base font-serif font-semibold text-charcoal-700">{discountedPrice != null ? money(discountedPrice) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-charcoal-400">Margin at Discount</p>
          <p className="text-base font-serif font-semibold text-charcoal-700">
            <MarginLabel margin={discountedMargin} currency={currency} locale={locale} />
          </p>
        </div>
        <div>
          <p className="text-xs text-charcoal-400" title="Cost of the on-hand stalled inventory itself — fixed, doesn't move with the discount %.">
            Cost Basis at Risk
          </p>
          <p className="text-base font-serif font-semibold text-charcoal-700">{costBasisAtRisk != null ? money(costBasisAtRisk) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-charcoal-400">Projected Buyers</p>
          <p className="text-base font-serif font-semibold text-charcoal-700">
            {projectedBuyers.toFixed(1)}{capped && <span className="text-xs text-amber-700 font-sans font-normal"> (capped)</span>}
          </p>
          <p className="text-[10px] text-charcoal-300">
            {K} eligible × {conversionPercent}% conversion
            {capped && <span className="text-amber-700"> → only {buyers.toFixed(1)} can actually buy ({unitsOnHand} on hand)</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-charcoal-400">Potential Revenue</p>
          <p className="text-base font-serif font-semibold text-olive-600">{money(potentialRevenue)}</p>
          <p className="text-[10px] text-charcoal-300">
            {buyers.toFixed(1)} buyer{buyers === 1 ? '' : 's'} × {discountedPrice != null ? money(discountedPrice) : '—'} — estimate, not guaranteed
          </p>
        </div>
      </div>

      {/* Create segment action — builds the Omnisend audience; the actual campaign send
          still happens manually in Omnisend, targeting this segment. */}
      {K === 0 ? (
        <p className="text-xs text-charcoal-400 italic">No consented customers match yet.</p>
      ) : confirming ? (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-charcoal-700 mb-3">
            This will create a segment in Omnisend named <strong>Might buy: {product.title}</strong>, tagging{' '}
            <strong>{consentedEmails.length}</strong> consented customer{consentedEmails.length === 1 ? '' : 's'} who bought a
            selected related product — ready for you to build a campaign toward in Omnisend. Non-consented customers are never
            included.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 text-sm font-medium text-white bg-terracotta-500 hover:bg-terracotta-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              Confirm & Create
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={creating}
              className="text-sm text-charcoal-400 hover:text-charcoal-600 px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 text-sm font-medium text-white bg-terracotta-500 hover:bg-terracotta-600 px-4 py-2 rounded-lg transition-colors"
        >
          <Users size={14} /> Create Segment for {K} customer{K === 1 ? '' : 's'}
        </button>
      )}

      {result && (
        <p className={`flex items-center gap-2 text-sm mt-3 ${result.ok ? 'text-olive-600' : 'text-red-600'}`}>
          {result.message}
        </p>
      )}
    </div>
  )
}

// Restock-signup panel — shown whenever a product has at least one sold-out variant
// (independent of the product-level soldOut/isSoldOutLive flag, which sums across
// variants and can miss a single sold-out size/color). Local state per instance, same
// confirm-box pattern as StalledCampaignPanel above.
function RestockSignupPanel({
  product,
  data,
  loading,
  error,
  onCreateSegment,
}: {
  product: ProductSummary
  data: BackInStockResponse | null
  loading: boolean
  error: string | null
  onCreateSegment: (product: ProductSummary) => Promise<{ ok: boolean; message: string }>
}) {
  const [confirming, setConfirming] = useState(false)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const variantsWithSignups = (data?.variants ?? []).filter((v) => v.signups.length > 0)
  const uniqueEmails = new Set(variantsWithSignups.flatMap((v) => v.signups.map((s) => s.email))).size

  async function handleCreate() {
    setCreating(true)
    setResult(null)
    const outcome = await onCreateSegment(product)
    setResult(outcome)
    if (outcome.ok) setConfirming(false)
    setCreating(false)
  }

  return (
    <div className="bg-sand-50 rounded-xl p-4 mt-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">Restock Signups</p>

      {loading ? (
        <p className="text-sm text-charcoal-400 mb-4">Loading signups…</p>
      ) : error ? (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      ) : variantsWithSignups.length === 0 ? (
        <p className="text-sm text-charcoal-400 italic">No one has signed up for a restock alert on this product yet.</p>
      ) : (
        <>
          <ul className="space-y-3 mb-5">
            {variantsWithSignups.map((v) => (
              <li key={v.variantId}>
                <p className="text-sm text-charcoal-700 font-medium mb-1">
                  {v.variantTitle ?? `Variant #${v.variantId}`}
                  <span className="text-charcoal-400 font-normal"> · {v.signups.length} signup{v.signups.length === 1 ? '' : 's'}</span>
                  {v.inventoryQuantity != null && v.inventoryQuantity > 0 && (
                    <span className="text-[10px] text-olive-600 font-normal"> · back in stock ({v.inventoryQuantity} on hand)</span>
                  )}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {v.signups.map((s) => (
                    <li
                      key={`${v.variantId}-${s.email}`}
                      className="text-xs px-2 py-1 rounded-full bg-white border border-sand-200 text-charcoal-600"
                    >
                      {s.email}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {confirming ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-charcoal-700 mb-3">
                This will create a segment in Omnisend named <strong>Restock: {product.title}</strong>, adding/tagging{' '}
                <strong>{uniqueEmails}</strong> contact{uniqueEmails === 1 ? '' : 's'} who asked to be notified. Anyone not
                already an Omnisend contact will be added as a subscribed contact.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-2 text-sm font-medium text-white bg-terracotta-500 hover:bg-terracotta-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                >
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  Confirm & Create
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={creating}
                  className="text-sm text-charcoal-400 hover:text-charcoal-600 px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 text-sm font-medium text-white bg-terracotta-500 hover:bg-terracotta-600 px-4 py-2 rounded-lg transition-colors"
            >
              <Users size={14} /> Create Segment for {uniqueEmails} contact{uniqueEmails === 1 ? '' : 's'}
            </button>
          )}

          {result && (
            <p className={`flex items-center gap-2 text-sm mt-3 ${result.ok ? 'text-olive-600' : 'text-red-600'}`}>
              {result.message}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function ProductRow({
  row,
  index,
  currency,
  locale,
  expanded,
  onToggleExpand,
  onAssignCategory,
  onAssignCogs,
  hidden,
  confirmingHide,
  hidingBusy,
  hideError,
  onRequestHide,
  onConfirmHide,
  onCancelHide,
  onUndoHide,
  relatedEntries,
  productsById,
  interestedData,
  interestedLoading,
  interestedError,
  onRecomputeRelated,
  recomputingRelated,
  relatedComputedAt,
  onCreateSegment,
  restockExpanded,
  onToggleRestockExpand,
  restockData,
  restockLoading,
  restockError,
  onCreateRestockSegment,
}: {
  row: ResolvedRow
  index: number
  currency: string
  locale: string
  expanded: boolean
  onToggleExpand: () => void
  onAssignCategory: (title: string, category: string | null) => void
  onAssignCogs: (productId: number, sku: string | null, cost: number | null) => void
  hidden: boolean
  confirmingHide: boolean
  hidingBusy: boolean
  hideError?: string
  onRequestHide: () => void
  onConfirmHide: () => void
  onCancelHide: () => void
  onUndoHide: () => void
  relatedEntries: RelatedProductEntry[]
  productsById: Map<string, ProductSummary>
  interestedData: InterestedCustomersResponse | null
  interestedLoading: boolean
  interestedError: string | null
  onRecomputeRelated: () => void
  recomputingRelated: boolean
  relatedComputedAt: string | null
  onCreateSegment: (product: ProductSummary, emails: string[]) => Promise<{ ok: boolean; message: string }>
  restockExpanded: boolean
  onToggleRestockExpand: () => void
  restockData: BackInStockResponse | null
  restockLoading: boolean
  restockError: string | null
  onCreateRestockSegment: (product: ProductSummary) => Promise<{ ok: boolean; message: string }>
}) {
  const { product: p, badge, isSoldOutLive: soldOut } = row
  function money(n: number) { return fmt(n, currency, locale) }
  const lowStock = p.inventoryQuantity != null && p.inventoryQuantity > 0 && p.inventoryQuantity <= LOW_STOCK_THRESHOLD

  return (
    <>
      <tr className={zebraClass(index)}>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            <ProductThumb imageUrl={p.imageUrl} title={p.title} />
            <div className="min-w-0">
              <p className="text-sm text-charcoal-700 truncate max-w-[220px]">{p.title}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <CategoryEditor title={p.title} assignedCategory={row.category} onAssign={onAssignCategory} />
                <StatusBadgePill badge={badge} />
                {p.hasSoldOutVariant && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap bg-red-50 text-red-600 border-red-200">
                    Variant sold out
                  </span>
                )}
                {row.returnFlagged && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap bg-red-50 text-red-600 border-red-200"
                    title={`${(row.returnRate! * 100).toFixed(0)}% of units returned for sizing, style, description, or quality reasons`}
                  >
                    Potential issue with product
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-charcoal-300 uppercase tracking-wide">Cost:</span>
                <CogsEditor
                  productId={p.productId}
                  sku={p.sku}
                  nativeValue={p.nativeCogs}
                  manualValue={row.manualCost}
                  currency={currency}
                  locale={locale}
                  onAssign={onAssignCogs}
                />
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 px-4 text-right whitespace-nowrap">
          <p className="text-sm text-charcoal-700">{p.inventoryQuantity != null ? p.inventoryQuantity.toLocaleString() : '—'}</p>
          {lowStock && (
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <span className="text-[10px] font-semibold text-red-600 whitespace-nowrap">Low in stock</span>
              <a href={reorderMailto(p)} title="Email a reorder request" className="text-red-500 hover:text-red-600">
                <Mail size={10} />
              </a>
            </div>
          )}
        </td>
        <td className="py-3 px-4 text-right text-charcoal-700 whitespace-nowrap">{p.price != null ? money(p.price) : '—'}</td>
        <td className="py-3 pl-4 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-2">
            {soldOut && (
              hidden ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] px-2 py-1 rounded-full bg-olive-100 text-olive-600">Hidden</span>
                  <button
                    onClick={onUndoHide}
                    disabled={hidingBusy}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-sand-300 text-charcoal-600 hover:border-olive-400 hover:text-olive-600 transition-colors disabled:opacity-50"
                  >
                    {hidingBusy ? <Loader2 size={10} className="animate-spin" /> : null} Undo
                  </button>
                </div>
              ) : confirmingHide ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={onConfirmHide}
                    disabled={hidingBusy}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {hidingBusy ? <Loader2 size={10} className="animate-spin" /> : null} Confirm?
                  </button>
                  <button onClick={onCancelHide} className="text-[11px] px-2 py-1 text-charcoal-400 hover:text-charcoal-600">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={onRequestHide}
                  disabled={p.productId == null}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-sand-300 text-charcoal-600 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  Hide from Store
                </button>
              )
            )}
            {!soldOut && (
              <button
                onClick={onToggleExpand}
                className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors
                  ${expanded ? 'border-terracotta-400 text-terracotta-600 bg-terracotta-100/40' : 'border-sand-300 text-charcoal-600 hover:border-terracotta-300 hover:text-terracotta-600'}`}
              >
                <Megaphone size={11} /> Estimate recovery
                <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
            {p.hasSoldOutVariant && (
              <button
                onClick={onToggleRestockExpand}
                className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors
                  ${restockExpanded ? 'border-terracotta-400 text-terracotta-600 bg-terracotta-100/40' : 'border-sand-300 text-charcoal-600 hover:border-terracotta-300 hover:text-terracotta-600'}`}
              >
                <Mail size={11} /> Restock signups
                <ChevronDown size={11} className={`transition-transform ${restockExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          {hideError && <p className="text-[10px] text-red-500 mt-1">{hideError}</p>}
        </td>
      </tr>
      {!soldOut && expanded && (
        <tr>
          <td colSpan={4} className="pb-3">
            <StalledCampaignPanel
              product={p}
              currency={currency}
              locale={locale}
              cost={row.cost}
              relatedEntries={relatedEntries}
              productsById={productsById}
              interestedData={interestedData}
              interestedLoading={interestedLoading}
              interestedError={interestedError}
              onRecomputeRelated={onRecomputeRelated}
              recomputingRelated={recomputingRelated}
              relatedComputedAt={relatedComputedAt}
              onCreateSegment={onCreateSegment}
            />
          </td>
        </tr>
      )}
      {p.hasSoldOutVariant && restockExpanded && (
        <tr>
          <td colSpan={4} className="pb-3">
            <RestockSignupPanel
              product={p}
              data={restockData}
              loading={restockLoading}
              error={restockError}
              onCreateSegment={onCreateRestockSegment}
            />
          </td>
        </tr>
      )}
    </>
  )
}

export default function ProductsInventory({
  openProductId,
  onOpenProductHandled,
  initialFilter,
  onInitialFilterHandled,
  initialSort,
  onInitialSortHandled,
  onBackToSalesOverview,
}: {
  openProductId?: number | null
  onOpenProductHandled?: () => void
  initialFilter?: 'soldout' | 'stalled' | null
  onInitialFilterHandled?: () => void
  initialSort?: ProductSortKey | null
  onInitialSortHandled?: () => void
  onBackToSalesOverview?: () => void
} = {}) {
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [currency, setCurrency] = useState('EUR')
  const [locale, setLocale] = useState('en-US')
  const [source, setSource] = useState<'catalog' | 'orders'>('catalog')
  const [inventoryAvailable, setInventoryAvailable] = useState(false)
  const [returnsAvailable, setReturnsAvailable] = useState(false)
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({})
  const [cogsOverrides, setCogsOverrides] = useState<Record<string, { sku: string; manualCogs: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { includeDummy } = useDummyData()

  // KPI filter + toolbar
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [collectionFilter, setCollectionFilter] = useState('all')
  const [sortKey, setSortKey] = useState<ProductSortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(key: ProductSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 150)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Sold-out → hide-from-store flow
  const [manuallyHiddenIds, setManuallyHiddenIds] = useState<Set<number>>(new Set())
  const [confirmHideId, setConfirmHideId] = useState<number | null>(null)
  const [hidingId, setHidingId] = useState<number | null>(null)
  const [hideErrors, setHideErrors] = useState<Record<number, string>>({})

  // Related products (shared cache, fetched once) + per-product interested-customers (lazy, cached)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [relatedData, setRelatedData] = useState<RelatedProductsData | null>(null)
  const [recomputingRelated, setRecomputingRelated] = useState(false)
  const [interestedCache, setInterestedCache] = useState<Record<number, InterestedCustomersResponse>>({})
  const [interestedLoadingIds, setInterestedLoadingIds] = useState<Set<number>>(new Set())
  const [interestedErrors, setInterestedErrors] = useState<Record<number, string>>({})

  // Restock (back-in-stock) signups — separate expand toggle from the campaign panel above,
  // since a product can have a sold-out variant independent of soldOut/isSoldOutLive.
  const [restockExpandedRows, setRestockExpandedRows] = useState<Set<number>>(new Set())
  const [restockCache, setRestockCache] = useState<Record<number, BackInStockResponse>>({})
  const [restockLoadingIds, setRestockLoadingIds] = useState<Set<number>>(new Set())
  const [restockErrors, setRestockErrors] = useState<Record<number, string>>({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [productsRes, categoriesRes, cogsRes] = await Promise.all([
        fetch(withDummyParam('/api/shopify/products', includeDummy)),
        fetch('/api/shopify/product-categories'),
        fetch('/api/shopify/product-cogs'),
      ])
      const productsData = await productsRes.json()
      if (!productsRes.ok) throw new Error(productsData.error)
      const categoriesData = await categoriesRes.json()
      const cogsData = await cogsRes.json()

      setProducts(productsData.products ?? [])
      setCurrency(productsData.currency ?? 'EUR')
      setLocale(productsData.locale ?? 'en-US')
      setSource(productsData.source ?? 'catalog')
      setInventoryAvailable(productsData.inventoryAvailable ?? false)
      setReturnsAvailable(productsData.returnsAvailable ?? false)
      setCategoryOverrides(categoriesData.categories ?? {})
      setCogsOverrides(cogsData.cogs ?? {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [includeDummy])

  // Deep-link from Sales Overview's Needs Attention strip (stalled/sold-out) — a pure UI
  // toggle with no data dependency, so it can apply immediately unlike openProductId below.
  useEffect(() => {
    if (initialFilter == null) return
    setActiveFilter(initialFilter)
    onInitialFilterHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilter])

  // Deep-link from Sales Overview's "Most sold product" teaser.
  useEffect(() => {
    if (initialSort == null) return
    setSortKey(initialSort)
    onInitialSortHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSort])

  useEffect(() => {
    fetch('/api/shopify/related-products')
      .then((r) => r.json())
      .then(setRelatedData)
      .catch(() => {})
  }, [])

  // Cross-navigation from other sections (e.g. Customer Intelligence) — surface the product
  // via search and auto-expand its campaign panel (available for every product now).
  useEffect(() => {
    if (openProductId == null || products.length === 0) return
    const p = products.find((prod) => prod.productId === openProductId)
    if (p) {
      setSearchQuery(p.title)
      setExpandedRows((prev) => new Set(prev).add(openProductId))
      if (!interestedCache[openProductId]) loadInterested(openProductId)
    }
    onOpenProductHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openProductId, products])

  async function handleCategoryAssigned(title: string, category: string | null) {
    if (category) {
      await fetch('/api/shopify/product-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category }),
      })
      setCategoryOverrides((prev) => ({ ...prev, [title]: category }))
    } else {
      await fetch('/api/shopify/product-categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      setCategoryOverrides((prev) => {
        const next = { ...prev }
        delete next[title]
        return next
      })
    }
  }

  async function handleCogsAssigned(productId: number, sku: string | null, cost: number | null) {
    if (cost != null) {
      await fetch('/api/shopify/product-cogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, sku: sku ?? '', cost }),
      })
      setCogsOverrides((prev) => ({ ...prev, [String(productId)]: { sku: sku ?? '', manualCogs: cost } }))
    } else {
      await fetch('/api/shopify/product-cogs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      })
      setCogsOverrides((prev) => {
        const next = { ...prev }
        delete next[String(productId)]
        return next
      })
    }
  }

  function categoryFor(p: ProductSummary): string | null {
    return categoryOverrides[p.title] || p.category
  }

  function manualCogsFor(p: ProductSummary): number | null {
    if (p.productId != null) {
      const override = cogsOverrides[String(p.productId)]
      if (override) return override.manualCogs
    }
    return p.cogs
  }

  function cogsFor(p: ProductSummary): number | null {
    return p.nativeCogs ?? manualCogsFor(p)
  }

  function money(n: number): string {
    return fmt(n, currency, locale)
  }

  async function setProductLiveStatus(p: ProductSummary, status: 'draft' | 'active') {
    if (p.productId == null) return
    const id = p.productId
    setHidingId(id)
    setHideErrors((prev) => { const next = { ...prev }; delete next[id]; return next })
    try {
      const res = await fetch(`/api/shopify/products/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${status === 'draft' ? 'hide' : 'unhide'} product`)
      setManuallyHiddenIds((prev) => {
        const next = new Set(prev)
        if (status === 'draft') next.add(id)
        else next.delete(id)
        return next
      })
    } catch (e) {
      setHideErrors((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : `Failed to ${status === 'draft' ? 'hide' : 'unhide'} product` }))
    } finally {
      setHidingId(null)
      setConfirmHideId(null)
    }
  }

  async function loadInterested(productId: number) {
    setInterestedLoadingIds((prev) => new Set(prev).add(productId))
    setInterestedErrors((prev) => { const next = { ...prev }; delete next[productId]; return next })
    try {
      const res = await fetch(`/api/shopify/products/${productId}/interested-customers`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInterestedCache((prev) => ({ ...prev, [productId]: data }))
    } catch (e) {
      setInterestedErrors((prev) => ({ ...prev, [productId]: e instanceof Error ? e.message : 'Failed to load audience' }))
    } finally {
      setInterestedLoadingIds((prev) => { const next = new Set(prev); next.delete(productId); return next })
    }
  }

  function toggleExpand(productId: number | null) {
    if (productId == null) return
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
        if (!interestedCache[productId]) loadInterested(productId)
      }
      return next
    })
  }

  async function loadRestock(productId: number) {
    setRestockLoadingIds((prev) => new Set(prev).add(productId))
    setRestockErrors((prev) => { const next = { ...prev }; delete next[productId]; return next })
    try {
      const res = await fetch(`/api/shopify/products/${productId}/back-in-stock`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRestockCache((prev) => ({ ...prev, [productId]: data }))
    } catch (e) {
      setRestockErrors((prev) => ({ ...prev, [productId]: e instanceof Error ? e.message : 'Failed to load signups' }))
    } finally {
      setRestockLoadingIds((prev) => { const next = new Set(prev); next.delete(productId); return next })
    }
  }

  function toggleRestockExpand(productId: number | null) {
    if (productId == null) return
    setRestockExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
        if (!restockCache[productId]) loadRestock(productId)
      }
      return next
    })
  }

  async function recomputeRelated() {
    setRecomputingRelated(true)
    try {
      const res = await fetch('/api/shopify/related-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minSharedOrders: 3 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRelatedData(data)
      setInterestedCache({})
      for (const id of expandedRows) loadInterested(id)
    } catch {
      // Non-fatal — the audience line will keep showing whatever was last computed.
    } finally {
      setRecomputingRelated(false)
    }
  }

  async function handleCreateSegment(product: ProductSummary, emails: string[]): Promise<{ ok: boolean; message: string }> {
    if (product.productId == null || emails.length === 0) {
      return { ok: false, message: 'No consented customers to create a segment for.' }
    }
    try {
      const res = await fetch(`/api/shopify/products/${product.productId}/create-segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerEmails: emails, productTitle: product.title }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return {
        ok: true,
        message: data.alreadyExisted
          ? `Segment already existed in Omnisend — tagged ${data.tagged} customer${data.tagged === 1 ? '' : 's'}`
          : `Segment created in Omnisend — tagged ${data.tagged} customer${data.tagged === 1 ? '' : 's'}`,
      }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Failed to create segment' }
    }
  }

  async function handleCreateRestockSegment(product: ProductSummary): Promise<{ ok: boolean; message: string }> {
    if (product.productId == null) {
      return { ok: false, message: 'Missing product id.' }
    }
    try {
      const res = await fetch(`/api/shopify/products/${product.productId}/back-in-stock-segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productTitle: product.title }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return {
        ok: true,
        message: data.alreadyExisted
          ? `Segment already existed in Omnisend — tagged ${data.tagged} contact${data.tagged === 1 ? '' : 's'}`
          : `Segment created in Omnisend — tagged ${data.tagged} contact${data.tagged === 1 ? '' : 's'}`,
      }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Failed to create segment' }
    }
  }

  const productsById = useMemo(() => {
    const map = new Map<string, ProductSummary>()
    for (const p of products) if (p.productId != null) map.set(String(p.productId), p)
    return map
  }, [products])

  const totalInventoryUnits = useMemo(
    () => products.reduce((s, p) => s + (p.inventoryQuantity ?? 0), 0),
    [products],
  )

  const soldOutProducts = useMemo(() => products.filter(isSoldOutLive), [products])

  const returnFlaggedProducts = useMemo(() => products.filter((p) => p.returnFlagged), [products])

  const stalledSummary = useMemo(() => {
    const list = products.filter((p) => isStalled(p, STALLED_DAYS))
    const value = list.reduce((s, p) => {
      const cost = cogsFor(p)
      return cost != null ? s + (p.inventoryQuantity ?? 0) * cost : s
    }, 0)
    return { ...getStalledUnitsSummary(products), value }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, cogsOverrides])

  const bestSellerIds = useMemo(() => {
    const top = [...products]
      .filter((p) => p.unitsSoldWeek > 0)
      .sort((a, b) => b.unitsSoldWeek - a.unitsSoldWeek)
      .slice(0, 10)
    return new Set(top.map((p) => p.productId).filter((id): id is number => id != null))
  }, [products])

  const collectionOptions = useMemo(
    () => [...new Set(products.map((p) => categoryFor(p) || 'Uncategorized'))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, categoryOverrides],
  )

  const filteredSortedProducts = useMemo(() => {
    let list = products
    if (activeFilter === 'soldout') list = list.filter(isSoldOutLive)
    else if (activeFilter === 'stalled') list = list.filter((p) => isStalled(p, STALLED_DAYS))
    else if (activeFilter === 'returnrisk') list = list.filter((p) => p.returnFlagged)

    const q = debouncedQuery.trim().toLowerCase()
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q))

    if (collectionFilter !== 'all') {
      list = list.filter((p) => (categoryFor(p) || 'Uncategorized') === collectionFilter)
    }

    function statusRankFor(p: ProductSummary): number {
      const isBest = p.productId != null && bestSellerIds.has(p.productId)
      if (isBest) return STATUS_RANK.bestseller
      if (isSoldOutLive(p)) return STATUS_RANK.soldout
      if (isStalled(p, STALLED_DAYS)) return STATUS_RANK.stalled
      return STATUS_RANK.none
    }

    const sorted = [...list]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = a.title.localeCompare(b.title); break
        case 'bestselling': cmp = a.unitsSoldWeek - b.unitsSoldWeek; break
        case 'margin': {
          const am = marginAt(a.price, cogsFor(a))?.amount ?? -Infinity
          const bm = marginAt(b.price, cogsFor(b))?.amount ?? -Infinity
          cmp = am - bm
          break
        }
        case 'daysStalled': cmp = daysStalledFor(a) - daysStalledFor(b); break
        case 'onhand': cmp = (a.inventoryQuantity ?? -Infinity) - (b.inventoryQuantity ?? -Infinity); break
        case 'price': cmp = (a.price ?? -Infinity) - (b.price ?? -Infinity); break
        case 'status': cmp = statusRankFor(a) - statusRankFor(b); break
        default: cmp = 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, activeFilter, debouncedQuery, collectionFilter, sortKey, sortDir, bestSellerIds, categoryOverrides, cogsOverrides])

  const resolvedRows: ResolvedRow[] = useMemo(() => {
    return filteredSortedProducts.map((p) => {
      const isBest = p.productId != null && bestSellerIds.has(p.productId)
      const soldOut = isSoldOutLive(p)
      const stalledRow = isStalled(p, STALLED_DAYS)
      const badge: StatusBadge = isBest ? 'bestseller' : soldOut ? 'soldout' : stalledRow ? 'stalled' : null
      return {
        product: p,
        badge,
        isStalledRow: stalledRow,
        isSoldOutLive: soldOut,
        category: categoryFor(p),
        cost: cogsFor(p),
        manualCost: manualCogsFor(p),
        margin: marginAt(p.price, cogsFor(p)),
        returnRate: p.returnRate,
        returnFlagged: p.returnFlagged,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSortedProducts, bestSellerIds, categoryOverrides, cogsOverrides])

  return (
    <section className="max-w-full">
      {onBackToSalesOverview && (
        <button
          onClick={onBackToSalesOverview}
          className="flex items-center gap-1.5 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors mb-4"
        >
          <ArrowLeft size={14} /> Back to Sales Overview
        </button>
      )}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Products &amp; Inventory</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">
            {source === 'catalog' ? 'Your full product catalog' : 'Products sold in the last 12 months'}
          </p>
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

      {loading && <LoadingSpinner label="Pulling product data…" />}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <p className="text-sm text-charcoal-400 italic py-12 text-center">No products found.</p>
      )}

      {!loading && !error && source === 'orders' && (
        <div className="flex items-center gap-3 p-4 mb-6 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <Info size={16} className="shrink-0" />
          Showing only products sold in the last 12 months — full catalog access isn&apos;t active for this Shopify
          connection yet. Reconnecting Shopify from the app usually resolves this.
        </div>
      )}

      {!loading && !error && !inventoryAvailable && products.length > 0 && (
        <div className="flex items-center gap-3 p-4 mb-6 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <Info size={16} className="shrink-0" />
          Inventory data needs a Shopify reconnect — full catalog access isn&apos;t active for this connection yet, so
          units-on-hand, sold-out, and stalled-inventory figures can&apos;t be computed. Reconnecting Shopify from the
          app usually resolves this.
        </div>
      )}

      {!loading && !error && inventoryAvailable && !returnsAvailable && products.length > 0 && (
        <div className="flex items-center gap-3 p-4 mb-6 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <Info size={16} className="shrink-0" />
          Product health flagging needs a Shopify reconnect — return-reason data isn&apos;t active for this connection
          yet, so the &quot;Potential issue with product&quot; flag can&apos;t be computed. Reconnecting Shopify from the
          app usually resolves this.
        </div>
      )}

      {!loading && !error && inventoryAvailable && products.length > 0 && (
        <>
          {/* ─── KPI strip (client-side filter, no navigation) ────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard
              icon={<Boxes size={12} />}
              label="Total Inventory"
              value={totalInventoryUnits.toLocaleString()}
              sub={`${products.length} products`}
              active={activeFilter === 'all'}
              onClick={() => setActiveFilter('all')}
            />
            <KpiCard
              icon={<XCircle size={12} />}
              label="Sold Out, Still Live"
              value={soldOutProducts.length.toLocaleString()}
              sub="in stock = 0, visible on store"
              active={activeFilter === 'soldout'}
              onClick={() => setActiveFilter((f) => (f === 'soldout' ? 'all' : 'soldout'))}
            />
            <KpiCard
              icon={<Clock size={12} />}
              label="Stalled Inventory"
              value={`${stalledSummary.units.toLocaleString()} units`}
              sub={`Cost basis ${money(stalledSummary.value)} · Potential revenue ${money(stalledSummary.potentialRevenue)}`}
              footnote={`Stalled = no sale in over ${STALLED_DAYS} days. Potential revenue = full-price sell-through of on-hand stock.`}
              active={activeFilter === 'stalled'}
              onClick={() => setActiveFilter((f) => (f === 'stalled' ? 'all' : 'stalled'))}
            />
            <KpiCard
              icon={<AlertTriangle size={12} />}
              label="Product Health"
              value={returnFlaggedProducts.length.toLocaleString()}
              sub="return rate over 20%, sizing/style/quality reasons"
              footnote="Requires 5+ units sold all-time to be flagged."
              active={activeFilter === 'returnrisk'}
              onClick={() => setActiveFilter((f) => (f === 'returnrisk' ? 'all' : 'returnrisk'))}
            />
          </div>

          {/* ─── Toolbar ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-300" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-sand-300 rounded-lg focus:outline-none focus:border-terracotta-400"
              />
            </div>
            <select
              value={collectionFilter}
              onChange={(e) => setCollectionFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-sand-300 rounded-lg bg-white text-charcoal-700 focus:outline-none focus:border-terracotta-400"
            >
              <option value="all">All Collections</option>
              {collectionOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as ProductSortKey)}
              className="px-3 py-2 text-sm border border-sand-300 rounded-lg bg-white text-charcoal-700 focus:outline-none focus:border-terracotta-400"
            >
              <option value="name">Sort: Name</option>
              <option value="bestselling">Sort: Best Selling</option>
              <option value="margin">Sort: Margin</option>
              <option value="daysStalled">Sort: Days Stalled</option>
            </select>
          </div>

          {/* ─── Product table ───────────────────────────────────────────── */}
          {resolvedRows.length === 0 ? (
            <p className="text-sm text-charcoal-400 italic py-12 text-center">No products match these filters.</p>
          ) : (
            <div className="bg-white rounded-2xl shadow-card p-5">
              <div className="overflow-x-auto">
                <table className={`w-full min-w-[820px] text-sm border-separate border-spacing-0 ${COLUMN_BAND_CLASS}`}>
                  <thead>
                    <tr className="text-left text-xs text-charcoal-400 uppercase tracking-wide border-b border-sand-200">
                      <th className="pb-3 pr-4 font-medium">Product</th>
                      <SortableTh label="On Hand" sortKeyValue="onhand" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Price" sortKeyValue="price" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Status / Action" sortKeyValue="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-200">
                    {resolvedRows.map((row, i) => {
                      const p = row.product
                      const pid = p.productId
                      const hidden = pid != null && manuallyHiddenIds.has(pid)
                      const confirmingHide = pid != null && confirmHideId === pid
                      const hidingBusy = pid != null && hidingId === pid
                      const hideError = pid != null ? hideErrors[pid] : undefined
                      const expanded = pid != null && expandedRows.has(pid)
                      const relatedEntries = pid != null ? relatedData?.relations[String(pid)] ?? [] : []
                      const interestedData = pid != null ? interestedCache[pid] ?? null : null
                      const interestedLoading = pid != null && interestedLoadingIds.has(pid)
                      const interestedError = pid != null ? interestedErrors[pid] ?? null : null
                      const restockExpanded = pid != null && restockExpandedRows.has(pid)
                      const restockData = pid != null ? restockCache[pid] ?? null : null
                      const restockLoading = pid != null && restockLoadingIds.has(pid)
                      const restockError = pid != null ? restockErrors[pid] ?? null : null
                      return (
                        <ProductRow
                          key={p.title}
                          row={row}
                          index={i}
                          currency={currency}
                          locale={locale}
                          expanded={expanded}
                          onToggleExpand={() => toggleExpand(pid)}
                          onAssignCategory={handleCategoryAssigned}
                          onAssignCogs={handleCogsAssigned}
                          hidden={hidden}
                          confirmingHide={confirmingHide}
                          hidingBusy={hidingBusy}
                          hideError={hideError}
                          onRequestHide={() => setConfirmHideId(pid)}
                          onConfirmHide={() => setProductLiveStatus(p, 'draft')}
                          onCancelHide={() => setConfirmHideId(null)}
                          onUndoHide={() => setProductLiveStatus(p, 'active')}
                          relatedEntries={relatedEntries}
                          productsById={productsById}
                          interestedData={interestedData}
                          interestedLoading={interestedLoading}
                          interestedError={interestedError}
                          onRecomputeRelated={recomputeRelated}
                          recomputingRelated={recomputingRelated}
                          relatedComputedAt={relatedData?.computedAt ?? null}
                          onCreateSegment={handleCreateSegment}
                          restockExpanded={restockExpanded}
                          onToggleRestockExpand={() => toggleRestockExpand(pid)}
                          restockData={restockData}
                          restockLoading={restockLoading}
                          restockError={restockError}
                          onCreateRestockSegment={handleCreateRestockSegment}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

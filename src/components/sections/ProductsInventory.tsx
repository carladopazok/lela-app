'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, AlertCircle, Package, Check, X, TrendingUp, Info,
  ArrowLeft, Boxes, XCircle, Clock, Mail, Loader2,
} from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import CollapsibleCard from '@/components/ui/CollapsibleCard'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import type { ProductSummary } from '@/types'

type View = 'overview' | 'products' | 'collections' | 'bestsellers'
type BestSellerPeriod = 'week' | 'month'
type OverviewScreen = 'summary' | 'inventory' | 'sold-out' | 'stalled'
type StalledThreshold = 90 | 180 | 365

const STALLED_SUMMARY_THRESHOLD_DAYS = 120
const LOW_STOCK_THRESHOLD = 3
const DISCOUNT_TIERS = [0.2, 0.4, 0.6] as const

function fmt(n: number, currency: string) {
  return n.toLocaleString('es-ES', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isStalled(p: ProductSummary, thresholdDays: number): boolean {
  return p.lastSoldAt == null || daysSince(p.lastSoldAt) >= thresholdDays
}

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
      <div className="flex items-center gap-1">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
          {assignedCategory}
        </span>
        <button onClick={() => { setEditing(true); setValue(assignedCategory) }} className="text-[10px] text-charcoal-300 hover:text-charcoal-500">
          edit
        </button>
        <button onClick={() => onAssign(title, null)} className="text-[10px] text-charcoal-300 hover:text-red-400">
          remove
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
  title,
  value,
  currency,
  onAssign,
}: {
  title: string
  value: number | null
  currency: string
  onAssign: (title: string, cost: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  function commit() {
    const n = parseFloat(input)
    if (Number.isFinite(n) && n >= 0) { onAssign(title, n); setEditing(false); setInput('') }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
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

  if (value != null) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-charcoal-600">{fmt(value, currency)}/unit</span>
        <button onClick={() => { setEditing(true); setInput(String(value)) }} className="text-[10px] text-charcoal-300 hover:text-charcoal-500">
          edit
        </button>
        <button onClick={() => onAssign(title, null)} className="text-[10px] text-charcoal-300 hover:text-red-400">
          remove
        </button>
      </div>
    )
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

function OverviewCard({
  label,
  value,
  sub,
  footnote,
  onClick,
  icon,
}: {
  label: string
  value: string
  sub?: string
  footnote?: string
  onClick: () => void
  icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-2xl shadow-card p-6 flex flex-col gap-1 hover:ring-2 hover:ring-terracotta-300 transition-all"
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

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors mb-4">
      <ArrowLeft size={14} /> {label}
    </button>
  )
}

export default function ProductsInventory() {
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [currency, setCurrency] = useState('EUR')
  const [source, setSource] = useState<'catalog' | 'orders'>('catalog')
  const [inventoryAvailable, setInventoryAvailable] = useState(false)
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({})
  const [cogsOverrides, setCogsOverrides] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('overview')
  const [overviewScreen, setOverviewScreen] = useState<OverviewScreen>('summary')
  const [stalledThreshold, setStalledThreshold] = useState<StalledThreshold>(90)
  const [bestSellerPeriod, setBestSellerPeriod] = useState<BestSellerPeriod>('week')
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const { includeDummy } = useDummyData()

  // Sold-out → hide-from-store flow
  const [manuallyHiddenIds, setManuallyHiddenIds] = useState<Set<number>>(new Set())
  const [confirmHideId, setConfirmHideId] = useState<number | null>(null)
  const [hidingId, setHidingId] = useState<number | null>(null)
  const [hideErrors, setHideErrors] = useState<Record<number, string>>({})

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
      setSource(productsData.source ?? 'catalog')
      setInventoryAvailable(productsData.inventoryAvailable ?? false)
      setCategoryOverrides(categoriesData.categories ?? {})
      setCogsOverrides(cogsData.cogs ?? {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [includeDummy])

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

  async function handleCogsAssigned(title: string, cost: number | null) {
    if (cost != null) {
      await fetch('/api/shopify/product-cogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, cost }),
      })
      setCogsOverrides((prev) => ({ ...prev, [title]: cost }))
    } else {
      await fetch('/api/shopify/product-cogs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      setCogsOverrides((prev) => {
        const next = { ...prev }
        delete next[title]
        return next
      })
    }
  }

  function categoryFor(p: ProductSummary): string | null {
    return categoryOverrides[p.title] || p.category
  }

  function cogsFor(p: ProductSummary): number | null {
    return cogsOverrides[p.title] ?? p.cogs
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

  const alphaProducts = useMemo(
    () => [...products].sort((a, b) => a.title.localeCompare(b.title)),
    [products],
  )

  const collections = useMemo(() => {
    const map = new Map<string, ProductSummary[]>()
    for (const p of products) {
      const cat = categoryFor(p) || 'Uncategorized'
      const list = map.get(cat) ?? []
      list.push(p)
      map.set(cat, list)
    }
    return Array.from(map.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => b.unitsSold - a.unitsSold),
        unitsSold: items.reduce((s, p) => s + p.unitsSold, 0),
        revenue: items.reduce((s, p) => s + p.revenue, 0),
        inventoryUnits: items.reduce((s, p) => s + (p.inventoryQuantity ?? 0), 0),
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, categoryOverrides])

  const bestSellers = useMemo(() => {
    const key = bestSellerPeriod === 'week' ? 'unitsSoldWeek' : 'unitsSoldMonth'
    return [...products]
      .filter((p) => p[key] > 0)
      .sort((a, b) => b[key] - a[key])
      .slice(0, 10)
  }, [products, bestSellerPeriod])

  // ─── Overview derived data ────────────────────────────────────────────────

  const totalInventoryUnits = useMemo(
    () => products.reduce((s, p) => s + (p.inventoryQuantity ?? 0), 0),
    [products],
  )

  const soldOutProducts = useMemo(
    () => products.filter((p) => p.inventoryQuantity === 0 && p.status === 'active' && p.publishedAt !== null),
    [products],
  )

  const stalledSummary = useMemo(() => {
    const list = products.filter((p) => isStalled(p, STALLED_SUMMARY_THRESHOLD_DAYS))
    const units = list.reduce((s, p) => s + (p.inventoryQuantity ?? 0), 0)
    const value = list.reduce((s, p) => {
      const cost = cogsFor(p)
      return cost != null ? s + (p.inventoryQuantity ?? 0) * cost : s
    }, 0)
    return { units, value }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, cogsOverrides])

  const stalledDetailList = useMemo(
    () => products
      .filter((p) => isStalled(p, stalledThreshold))
      .sort((a, b) => (b.inventoryQuantity ?? 0) - (a.inventoryQuantity ?? 0)),
    [products, stalledThreshold],
  )

  const recoveryTiers = useMemo(() => {
    return DISCOUNT_TIERS.map((discount) => {
      let recoveredRevenue = 0
      let costRecovered = 0
      for (const p of stalledDetailList) {
        const units = p.inventoryQuantity ?? 0
        const price = p.price ?? 0
        recoveredRevenue += units * price * (1 - discount)
        const cost = cogsFor(p)
        if (cost != null) costRecovered += units * cost
      }
      return { discount, recoveredRevenue, costRecovered, netMargin: recoveredRevenue - costRecovered }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stalledDetailList, cogsOverrides])

  return (
    <section className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Products &amp; Inventory</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">
            {view === 'overview'
              ? 'Inventory health at a glance'
              : view === 'products'
              ? source === 'catalog'
                ? 'Your full product catalog'
                : 'Products sold in the last 12 months'
              : view === 'collections'
              ? 'Products grouped by category'
              : `Top sellers by units — ${bestSellerPeriod === 'week' ? 'trailing 7 days' : 'trailing 30 days'}`}
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

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-sand-100 p-1 rounded-xl w-fit">
        {(['overview', 'products', 'collections', 'bestsellers'] as const).map((v) => (
          <button
            key={v}
            onClick={() => { setView(v); if (v === 'overview') setOverviewScreen('summary') }}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all
              ${view === v ? 'bg-white text-charcoal-700 shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
          >
            {v === 'overview' ? 'Overview' : v === 'products' ? 'Products' : v === 'collections' ? 'Products by Collection' : 'Best Sellers'}
          </button>
        ))}
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

      {!loading && !error && source === 'orders' && view !== 'overview' && (
        <div className="flex items-center gap-3 p-4 mb-6 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <Info size={16} className="shrink-0" />
          Showing only products sold in the last 12 months — full catalog access isn&apos;t active for this Shopify
          connection yet. Reconnecting Shopify from the app usually resolves this.
        </div>
      )}

      {/* ─── Overview ────────────────────────────────────────────────────── */}

      {!loading && !error && products.length > 0 && view === 'overview' && (
        <>
          {!inventoryAvailable && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <Info size={16} className="shrink-0" />
              Inventory data needs a Shopify reconnect — full catalog access isn&apos;t active for this connection yet,
              so units-on-hand, sold-out, and stalled-inventory figures can&apos;t be computed. Reconnecting Shopify
              from the app usually resolves this.
            </div>
          )}

          {inventoryAvailable && overviewScreen === 'summary' && (
            <div className="grid grid-cols-3 gap-4">
              <OverviewCard
                icon={<Boxes size={12} />}
                label="Total Inventory"
                value={totalInventoryUnits.toLocaleString()}
                sub={`${products.length} products`}
                onClick={() => setOverviewScreen('inventory')}
              />
              <OverviewCard
                icon={<XCircle size={12} />}
                label="Sold Out, Still Live"
                value={soldOutProducts.length.toLocaleString()}
                sub="in stock = 0, visible on store"
                onClick={() => setOverviewScreen('sold-out')}
              />
              <OverviewCard
                icon={<Clock size={12} />}
                label="Stalled Inventory"
                value={`${stalledSummary.units.toLocaleString()} units`}
                sub={fmt(stalledSummary.value, currency)}
                footnote="Stalled = no sale in over 120 days."
                onClick={() => setOverviewScreen('stalled')}
              />
            </div>
          )}

          {inventoryAvailable && overviewScreen === 'inventory' && (
            <>
              <BackButton onClick={() => setOverviewScreen('summary')} label="Back to overview" />
              <div className="bg-white rounded-2xl shadow-card p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">
                  Inventory by Product · {alphaProducts.length}
                </p>
                <ul className="divide-y divide-sand-200">
                  {alphaProducts.map((p) => (
                    <li key={p.title} className="py-3 flex items-center gap-3">
                      <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-charcoal-700 truncate">{p.title}</p>
                        <p className="text-[11px] text-charcoal-300">{categoryFor(p) || 'Uncategorized'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-charcoal-700">{(p.inventoryQuantity ?? 0).toLocaleString()} on hand</p>
                        <p className="text-xs text-charcoal-400 capitalize">{p.status ?? '—'}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {inventoryAvailable && overviewScreen === 'sold-out' && (
            <>
              <BackButton onClick={() => setOverviewScreen('summary')} label="Back to overview" />
              {soldOutProducts.length === 0 ? (
                <p className="text-sm text-charcoal-400 italic py-12 text-center">No sold-out products currently live.</p>
              ) : (
                <div className="bg-white rounded-2xl shadow-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">
                    Sold Out, Still Live · {soldOutProducts.length}
                  </p>
                  <ul className="divide-y divide-sand-200">
                    {soldOutProducts.map((p) => {
                      const hidden = p.productId != null && manuallyHiddenIds.has(p.productId)
                      const confirming = p.productId != null && confirmHideId === p.productId
                      const busy = p.productId != null && hidingId === p.productId
                      const rowError = p.productId != null ? hideErrors[p.productId] : undefined
                      return (
                        <li key={p.title} className="py-3 flex items-center gap-3">
                          <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-charcoal-700 truncate">{p.title}</p>
                            <p className="text-[11px] text-charcoal-300">
                              {categoryFor(p) || 'Uncategorized'} · Last sold {formatDate(p.lastSoldAt)}
                            </p>
                            {rowError && <p className="text-[11px] text-red-500 mt-0.5">{rowError}</p>}
                          </div>
                          <div className="shrink-0">
                            {hidden ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs px-2 py-1 rounded-full bg-olive-100 text-olive-600">Hidden</span>
                                <button
                                  onClick={() => setProductLiveStatus(p, 'active')}
                                  disabled={busy}
                                  className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-sand-300 text-charcoal-600 hover:border-olive-400 hover:text-olive-600 transition-colors disabled:opacity-50"
                                >
                                  {busy ? <Loader2 size={11} className="animate-spin" /> : null}
                                  Undo — Show on Store
                                </button>
                              </div>
                            ) : confirming ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setProductLiveStatus(p, 'draft')}
                                  disabled={busy}
                                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                                >
                                  {busy ? <Loader2 size={11} className="animate-spin" /> : null}
                                  Confirm hide?
                                </button>
                                <button onClick={() => setConfirmHideId(null)} className="text-xs px-2 py-1 text-charcoal-400 hover:text-charcoal-600">
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmHideId(p.productId)}
                                disabled={p.productId == null}
                                className="text-xs px-3 py-1.5 rounded-lg border border-sand-300 text-charcoal-600 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40"
                              >
                                Hide from Store
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </>
          )}

          {inventoryAvailable && overviewScreen === 'stalled' && (
            <>
              <BackButton onClick={() => setOverviewScreen('summary')} label="Back to overview" />

              <div className="flex gap-2 mb-6">
                {([90, 180, 365] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setStalledThreshold(d)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
                      ${stalledThreshold === d
                        ? 'bg-terracotta-500 text-white shadow-sm'
                        : 'bg-white border border-sand-300 text-charcoal-500 hover:bg-sand-100 hover:border-sand-400'
                      }`}
                  >
                    {d}+ Days
                  </button>
                ))}
              </div>

              {stalledDetailList.length === 0 ? (
                <p className="text-sm text-charcoal-400 italic py-12 text-center">No stalled products at this threshold.</p>
              ) : (
                <>
                  <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
                    <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">
                      Stalled {stalledThreshold}+ Days · {stalledDetailList.length} products
                    </p>
                    <ul className="divide-y divide-sand-200">
                      {stalledDetailList.map((p) => {
                        const units = p.inventoryQuantity ?? 0
                        const cost = cogsFor(p)
                        return (
                          <li key={p.title} className="py-3 flex items-center gap-3">
                            <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-charcoal-700 truncate">{p.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <CogsEditor title={p.title} value={cost} currency={currency} onAssign={handleCogsAssigned} />
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium text-charcoal-700">{units.toLocaleString()} on hand</p>
                              <p className="text-xs text-charcoal-400">
                                {p.lastSoldAt ? `${daysSince(p.lastSoldAt)}d since last sale` : 'Never sold'}
                              </p>
                              <p className="text-xs text-charcoal-400">
                                {cost != null ? `${fmt(units * cost, currency)} stalled` : '— add cost'}
                              </p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>

                  <div className="bg-white rounded-2xl shadow-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-1">
                      Recovery If Discounted
                    </p>
                    <p className="text-[11px] text-charcoal-300 mb-4">
                      Based on current price and the cost entered above — products without a cost still count toward
                      recovered revenue but not cost/margin.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-charcoal-400 uppercase tracking-wide">
                            <th className="pb-2 font-medium">Discount</th>
                            <th className="pb-2 font-medium text-right">Recovered Revenue</th>
                            <th className="pb-2 font-medium text-right">Cost Recovered</th>
                            <th className="pb-2 font-medium text-right">Net Margin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-sand-200">
                          {recoveryTiers.map(({ discount, recoveredRevenue, costRecovered, netMargin }) => (
                            <tr key={discount}>
                              <td className="py-2.5 text-charcoal-700 font-medium">{Math.round(discount * 100)}% off</td>
                              <td className="py-2.5 text-right text-charcoal-700">{fmt(recoveredRevenue, currency)}</td>
                              <td className="py-2.5 text-right text-charcoal-500">{fmt(costRecovered, currency)}</td>
                              <td className="py-2.5 text-right font-medium text-olive-600">{fmt(netMargin, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Products ────────────────────────────────────────────────────── */}

      {!loading && !error && products.length > 0 && view === 'products' && (
        <div className="bg-white rounded-2xl shadow-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">
            All Products · {products.length}
          </p>
          <ul className="divide-y divide-sand-200">
            {alphaProducts.map((p) => (
              <li key={p.title} className="py-3 flex items-center gap-3">
                <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-charcoal-700 truncate">{p.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <CategoryEditor title={p.title} assignedCategory={categoryFor(p)} onAssign={handleCategoryAssigned} />
                    {p.vendor && <span className="text-[11px] text-charcoal-300">{p.vendor}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-charcoal-700">{p.unitsSold.toLocaleString()} sold</p>
                  <p className="text-xs text-charcoal-400">
                    {fmt(p.revenue, currency)} · {p.inventoryQuantity != null ? `${p.inventoryQuantity} on hand` : '— on hand'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Products by Collection ──────────────────────────────────────── */}

      {!loading && !error && products.length > 0 && view === 'collections' && (
        <div className="space-y-3">
          {collections.map(({ category, items, unitsSold, revenue, inventoryUnits }) => (
            <CollapsibleCard
              key={category}
              label={category}
              count={items.length}
              isOpen={openCategory === category}
              onToggle={() => setOpenCategory(openCategory === category ? null : category)}
              icon={<Package size={11} />}
            >
              <div className="flex gap-6 mb-4 text-sm">
                <div>
                  <p className="text-xs text-charcoal-400">Units Sold</p>
                  <p className="font-medium text-charcoal-700">{unitsSold.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-400">Revenue</p>
                  <p className="font-medium text-charcoal-700">{fmt(revenue, currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-400">Units on Hand</p>
                  <p className="font-medium text-charcoal-700">{inventoryAvailable ? inventoryUnits.toLocaleString() : '—'}</p>
                </div>
              </div>
              <ul className="divide-y divide-sand-200">
                {items.map((p) => (
                  <li key={p.title} className="py-2.5 flex items-center gap-3">
                    <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                    <span className="flex-1 min-w-0 text-sm text-charcoal-700 truncate">{p.title}</span>
                    <span className="text-xs text-charcoal-400 shrink-0">{p.unitsSold.toLocaleString()} sold</span>
                    <span className="text-xs text-charcoal-400 shrink-0">
                      {p.inventoryQuantity != null ? `${p.inventoryQuantity} on hand` : '— on hand'}
                    </span>
                  </li>
                ))}
              </ul>
            </CollapsibleCard>
          ))}
        </div>
      )}

      {/* ─── Best Sellers ────────────────────────────────────────────────── */}

      {!loading && !error && products.length > 0 && view === 'bestsellers' && (
        <>
          <div className="flex gap-2 mb-6">
            {(['week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setBestSellerPeriod(p)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
                  ${bestSellerPeriod === p
                    ? 'bg-terracotta-500 text-white shadow-sm'
                    : 'bg-white border border-sand-300 text-charcoal-500 hover:bg-sand-100 hover:border-sand-400'
                  }`}
              >
                {p === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>

          {bestSellers.length === 0 ? (
            <p className="text-sm text-charcoal-400 italic py-12 text-center">
              No units sold in this period yet.
            </p>
          ) : (
            <div className="bg-white rounded-2xl shadow-card p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4 flex items-center gap-1.5">
                <TrendingUp size={12} /> Top {bestSellers.length} — {bestSellerPeriod === 'week' ? 'Trailing 7 Days' : 'Trailing 30 Days'}
              </p>
              <ul className="divide-y divide-sand-200">
                {bestSellers.map((p, i) => {
                  const units = bestSellerPeriod === 'week' ? p.unitsSoldWeek : p.unitsSoldMonth
                  const lowStock = p.inventoryQuantity != null && p.inventoryQuantity <= LOW_STOCK_THRESHOLD
                  return (
                    <li key={p.title} className="py-3 flex items-center gap-3">
                      <span className="w-5 shrink-0 text-sm font-serif font-semibold text-charcoal-300">{i + 1}</span>
                      <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-charcoal-700 truncate">{p.title}</p>
                        {categoryFor(p) && <p className="text-[11px] text-charcoal-300">{categoryFor(p)}</p>}
                        {lowStock && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] font-semibold text-red-600">
                              Low in stock ({p.inventoryQuantity} left)
                            </span>
                            <a
                              href={reorderMailto(p)}
                              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Mail size={10} /> Re-order
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-charcoal-700">{units.toLocaleString()} sold</p>
                        <p className="text-xs text-charcoal-400">{fmt(p.revenue, currency)} total</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

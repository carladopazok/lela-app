'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, AlertCircle, Package, Check, X, TrendingUp, Info,
  ArrowLeft, Boxes, XCircle, Clock, Mail, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Pencil,
} from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import CollapsibleCard from '@/components/ui/CollapsibleCard'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import type { ProductSummary, RelatedProductsData, InterestedCustomersResponse } from '@/types'

type View = 'overview' | 'products' | 'collections' | 'bestsellers' | 'product-detail'
type BestSellerPeriod = 'week' | 'month'
type OverviewScreen = 'summary' | 'inventory' | 'sold-out' | 'stalled'
type StalledThreshold = 90 | 180 | 365
type ProductSortKey = 'title' | 'category' | 'price' | 'margin'

const LOW_STOCK_THRESHOLD = 3
const DISCOUNT_OPTIONS = [0, 0.2, 0.4, 0.6] as const
const CONVERSION_OPTIONS = [0.05, 0.1, 0.2] as const

function fmt(n: number, currency: string, locale: string) {
  try {
    return n.toLocaleString(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } catch {
    // Malformed locale from the store (or currency the runtime doesn't recognize) — fall back
    // rather than throwing, so a formatting quirk never blanks out the whole page.
    return n.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// A product with no sale yet isn't automatically "stalled" — it's only stalled once it's actually
// been available long enough to judge. Falls back from last-sold date to when it went live
// (published_at), then to when it was created, rather than treating "never sold" as an instant,
// threshold-proof flag.
function isStalled(p: ProductSummary, thresholdDays: number): boolean {
  const reference = p.lastSoldAt ?? p.publishedAt ?? p.createdAt
  if (reference == null) return false
  return daysSince(reference) >= thresholdDays
}

// Per-unit margin at current price vs. a given cost — null when either is missing.
function marginFor(p: ProductSummary, cost: number | null): { amount: number; percent: number } | null {
  if (p.price == null || cost == null || p.price === 0) return null
  const amount = p.price - cost
  return { amount, percent: (amount / p.price) * 100 }
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

function computeRecovery(
  list: ProductSummary[],
  discountFor: (p: ProductSummary) => number,
  cogsFor: (p: ProductSummary) => number | null,
) {
  let recoveredRevenue = 0
  let costRecovered = 0
  let totalUnits = 0
  for (const p of list) {
    const units = p.inventoryQuantity ?? 0
    const price = p.price ?? 0
    recoveredRevenue += units * price * (1 - discountFor(p))
    const cost = cogsFor(p)
    if (cost != null) costRecovered += units * cost
    totalUnits += units
  }
  return { recoveredRevenue, costRecovered, netMargin: recoveredRevenue - costRecovered, totalUnits }
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

// Wraps a product's title anywhere it's listed — opens its Product Detail screen (related
// products, units sold, might-be-interested). Falls back to plain text when there's no
// product id to navigate with (e.g. the order-derived catalog fallback).
function ProductTitleButton({
  product,
  onOpen,
  className,
}: {
  product: ProductSummary
  onOpen: (p: ProductSummary) => void
  className?: string
}) {
  if (product.productId == null) {
    return <span className={className}>{product.title}</span>
  }
  return (
    <button
      onClick={() => onOpen(product)}
      title="View product details"
      className={`${className ?? ''} text-left hover:text-terracotta-600 hover:underline transition-colors`}
    >
      {product.title}
    </button>
  )
}

function SortHeader<K extends string>({
  label,
  sortKeyValue,
  activeKey,
  dir,
  onSort,
  align = 'left',
}: {
  label: string
  sortKeyValue: K
  activeKey: K
  dir: 'asc' | 'desc'
  onSort: (key: K) => void
  align?: 'left' | 'right'
}) {
  const active = activeKey === sortKeyValue
  return (
    <th className={`pb-3 px-4 font-medium whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(sortKeyValue)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-charcoal-600 transition-colors ${active ? 'text-charcoal-600' : ''}`}
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

export default function ProductsInventory({
  openProductId,
  onOpenProductHandled,
}: {
  openProductId?: number | null
  onOpenProductHandled?: () => void
} = {}) {
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [currency, setCurrency] = useState('EUR')
  const [locale, setLocale] = useState('en-US')
  const [source, setSource] = useState<'catalog' | 'orders'>('catalog')
  const [inventoryAvailable, setInventoryAvailable] = useState(false)
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({})
  const [cogsOverrides, setCogsOverrides] = useState<Record<string, { sku: string; manualCogs: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('overview')
  const [overviewScreen, setOverviewScreen] = useState<OverviewScreen>('summary')
  const [stalledThreshold, setStalledThreshold] = useState<StalledThreshold>(90)
  const [selectedDiscount, setSelectedDiscount] = useState(0)
  const [customDiscountInput, setCustomDiscountInput] = useState('')
  const [rowDiscountOverrides, setRowDiscountOverrides] = useState<Record<string, number>>({})
  const [bestSellerPeriod, setBestSellerPeriod] = useState<BestSellerPeriod>('week')
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<ProductSortKey>('title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const { includeDummy } = useDummyData()

  // Related products / cross-sell segmentation (Product Detail screen)
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [relatedData, setRelatedData] = useState<RelatedProductsData | null>(null)
  const [interestedData, setInterestedData] = useState<InterestedCustomersResponse | null>(null)
  const [loadingProductDetail, setLoadingProductDetail] = useState(false)
  const [productDetailError, setProductDetailError] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [conversionRate, setConversionRate] = useState<number>(0.1)
  const [customConversionInput, setCustomConversionInput] = useState('')
  const [segmentConfirming, setSegmentConfirming] = useState(false)
  const [creatingSegment, setCreatingSegment] = useState(false)
  const [segmentResult, setSegmentResult] = useState<{ ok: boolean; message: string } | null>(null)

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
      setLocale(productsData.locale ?? 'en-US')
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

  // Cross-navigation from other sections (e.g. Customer Intelligence) — jump straight to a
  // product's detail screen once its data has loaded.
  useEffect(() => {
    if (openProductId == null || products.length === 0) return
    setSelectedProductId(openProductId)
    setView('product-detail')
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

  // Manually entered cost only (client override wins over the server-merged value optimistically).
  function manualCogsFor(p: ProductSummary): number | null {
    if (p.productId != null) {
      const override = cogsOverrides[String(p.productId)]
      if (override) return override.manualCogs
    }
    return p.cogs
  }

  // Final cost used everywhere calculations happen: Shopify's native "Cost per item" wins,
  // falling back to the manually entered cost.
  function cogsFor(p: ProductSummary): number | null {
    return p.nativeCogs ?? manualCogsFor(p)
  }

  function money(n: number): string {
    return fmt(n, currency, locale)
  }

  // Effective discount for a product: a per-product override wins, otherwise the global slider/pill value.
  function discountFor(p: ProductSummary): number {
    return rowDiscountOverrides[p.title] ?? selectedDiscount
  }

  function setRowDiscount(title: string, value: number | null) {
    setRowDiscountOverrides((prev) => {
      const next = { ...prev }
      if (value == null) delete next[title]
      else next[title] = value
      return next
    })
  }

  function handleSort(key: ProductSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function openProductDetail(p: ProductSummary) {
    if (p.productId == null) return
    setSelectedProductId(p.productId)
    setView('product-detail')
  }

  async function loadProductDetail(productId: number) {
    setLoadingProductDetail(true)
    setProductDetailError(null)
    setSegmentConfirming(false)
    setSegmentResult(null)
    try {
      const [relatedRes, interestedRes] = await Promise.all([
        fetch('/api/shopify/related-products'),
        fetch(`/api/shopify/products/${productId}/interested-customers`),
      ])
      const relatedJson = await relatedRes.json()
      if (!relatedRes.ok) throw new Error(relatedJson.error)
      const interestedJson = await interestedRes.json()
      if (!interestedRes.ok) throw new Error(interestedJson.error)
      setRelatedData(relatedJson)
      setInterestedData(interestedJson)
    } catch (e) {
      setProductDetailError(e instanceof Error ? e.message : 'Failed to load related products')
    } finally {
      setLoadingProductDetail(false)
    }
  }

  useEffect(() => {
    if (view === 'product-detail' && selectedProductId != null) loadProductDetail(selectedProductId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedProductId])

  async function recomputeRelated() {
    setRecomputing(true)
    setProductDetailError(null)
    try {
      const res = await fetch('/api/shopify/related-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minSharedOrders: 3 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRelatedData(data)
      if (selectedProductId != null) await loadProductDetail(selectedProductId)
    } catch (e) {
      setProductDetailError(e instanceof Error ? e.message : 'Failed to recompute related products')
    } finally {
      setRecomputing(false)
    }
  }

  async function handleCreateSegment(selectedProduct: ProductSummary, consentedEmails: string[]) {
    if (consentedEmails.length === 0) return
    setCreatingSegment(true)
    setSegmentResult(null)
    try {
      const res = await fetch(`/api/shopify/products/${selectedProduct.productId}/create-segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerEmails: consentedEmails, productTitle: selectedProduct.title }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSegmentResult({
        ok: true,
        message: data.alreadyExisted
          ? `Segment already existed in Omnisend — tagged ${data.tagged} customer${data.tagged === 1 ? '' : 's'}`
          : `Segment created in Omnisend — tagged ${data.tagged} customer${data.tagged === 1 ? '' : 's'}`,
      })
      setSegmentConfirming(false)
    } catch (e) {
      setSegmentResult({ ok: false, message: e instanceof Error ? e.message : 'Failed to create segment' })
    } finally {
      setCreatingSegment(false)
    }
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

  const sortedProducts = useMemo(() => {
    function valueFor(p: ProductSummary): string | number {
      switch (sortKey) {
        case 'title': return p.title.toLowerCase()
        case 'category': return (categoryFor(p) || 'Uncategorized').toLowerCase()
        case 'price': return p.price ?? -Infinity
        case 'margin': return marginFor(p, cogsFor(p))?.amount ?? -Infinity
      }
    }
    return [...products].sort((a, b) => {
      const av = valueFor(a)
      const bv = valueFor(b)
      let cmp = 0
      if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv)
      else cmp = (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, sortKey, sortDir, categoryOverrides, cogsOverrides])

  const productsById = useMemo(() => {
    const map = new Map<string, ProductSummary>()
    for (const p of products) if (p.productId != null) map.set(String(p.productId), p)
    return map
  }, [products])

  const selectedProduct = selectedProductId != null ? productsById.get(String(selectedProductId)) ?? null : null

  const relatedEntries = useMemo(
    () => (selectedProductId != null ? relatedData?.relations[String(selectedProductId)] ?? [] : []),
    [relatedData, selectedProductId],
  )

  const consentedEmails = useMemo(
    () => (interestedData?.customers ?? []).filter((c) => c.consented).map((c) => c.email),
    [interestedData],
  )

  const estimatedRevenue = (interestedData?.consented ?? 0) * conversionRate * (selectedProduct?.price ?? 0)
  const customerSharePercent = interestedData && interestedData.totalCustomers > 0
    ? (interestedData.total / interestedData.totalCustomers) * 100
    : 0

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

  // Shares the same threshold as the day-range tabs in the Stalled detail screen — one
  // dial, not a separate hardcoded number, so the Overview card never disagrees with the tabs.
  const stalledSummary = useMemo(() => {
    const list = products.filter((p) => isStalled(p, stalledThreshold))
    const units = list.reduce((s, p) => s + (p.inventoryQuantity ?? 0), 0)
    const value = list.reduce((s, p) => {
      const cost = cogsFor(p)
      return cost != null ? s + (p.inventoryQuantity ?? 0) * cost : s
    }, 0)
    return { units, value }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, stalledThreshold, cogsOverrides])

  const stalledDetailList = useMemo(
    () => products
      .filter((p) => isStalled(p, stalledThreshold))
      .sort((a, b) => (b.inventoryQuantity ?? 0) - (a.inventoryQuantity ?? 0)),
    [products, stalledThreshold],
  )

  const discountResult = useMemo(
    () => computeRecovery(stalledDetailList, discountFor, cogsFor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stalledDetailList, selectedDiscount, rowDiscountOverrides, cogsOverrides],
  )

  return (
    <section className="max-w-full">
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
              : view === 'product-detail'
              ? 'Related products & cross-sell'
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

      {/* Tab bar — Overview gets its own colour; every other tab (including the Stalled
          shortcut, which just jumps into Overview's stalled drill-down) shares another. */}
      <div className="flex gap-1 mb-6 bg-sand-100 p-1 rounded-xl w-fit flex-wrap">
        <button
          onClick={() => { setView('overview'); setOverviewScreen('summary') }}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all
            ${view === 'overview' && overviewScreen !== 'stalled'
              ? 'bg-terracotta-500 text-white shadow-sm'
              : 'text-charcoal-400 hover:text-charcoal-600'}`}
        >
          Overview
        </button>
        {(['products', 'collections', 'bestsellers'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all
              ${view === v ? 'bg-olive-600 text-white shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
          >
            {v === 'products' ? 'Products' : v === 'collections' ? 'Products by Collection' : 'Best Sellers'}
          </button>
        ))}
        <button
          onClick={() => { setView('overview'); setOverviewScreen('stalled') }}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all
            ${view === 'overview' && overviewScreen === 'stalled'
              ? 'bg-olive-600 text-white shadow-sm'
              : 'text-charcoal-400 hover:text-charcoal-600'}`}
        >
          Stalled
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
                sub={money(stalledSummary.value)}
                footnote={`Stalled = no sale in over ${stalledThreshold} days.`}
                onClick={() => setOverviewScreen('stalled')}
              />
            </div>
          )}

          {inventoryAvailable && overviewScreen === 'inventory' && (
            <>
              <BackButton onClick={() => setOverviewScreen('summary')} label="Back to overview" />
              <h3 className="font-serif text-2xl text-charcoal-700 tracking-tight mb-4">Total Inventory</h3>
              <div className="bg-white rounded-2xl shadow-card p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">
                  Inventory by Product · {alphaProducts.length}
                </p>
                <ul className="divide-y divide-sand-200">
                  {alphaProducts.map((p, i) => (
                    <li key={p.title} className={`py-3 px-2 rounded-lg flex items-center gap-3 ${zebraClass(i)}`}>
                      <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                      <div className="flex-1 min-w-0">
                        <ProductTitleButton product={p} onOpen={openProductDetail} className="text-sm text-charcoal-700 truncate block" />
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
              <h3 className="font-serif text-2xl text-charcoal-700 tracking-tight mb-4">Sold Out, Still Live</h3>
              {soldOutProducts.length === 0 ? (
                <p className="text-sm text-charcoal-400 italic py-12 text-center">No sold-out products currently live.</p>
              ) : (
                <div className="bg-white rounded-2xl shadow-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">
                    Sold Out, Still Live · {soldOutProducts.length}
                  </p>
                  <ul className="divide-y divide-sand-200">
                    {soldOutProducts.map((p, i) => {
                      const hidden = p.productId != null && manuallyHiddenIds.has(p.productId)
                      const confirming = p.productId != null && confirmHideId === p.productId
                      const busy = p.productId != null && hidingId === p.productId
                      const rowError = p.productId != null ? hideErrors[p.productId] : undefined
                      return (
                        <li key={p.title} className={`py-3 px-2 rounded-lg flex items-center gap-3 ${zebraClass(i)}`}>
                          <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                          <div className="flex-1 min-w-0">
                            <ProductTitleButton product={p} onOpen={openProductDetail} className="text-sm text-charcoal-700 truncate block" />
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
              <h3 className="font-serif text-2xl text-charcoal-700 tracking-tight mb-4">Stalled Inventory</h3>

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
                <div className="bg-white rounded-2xl shadow-card p-5">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400">
                      Stalled {stalledThreshold}+ Days · {stalledDetailList.length} products
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1 bg-sand-100 p-1 rounded-xl flex-wrap">
                        {DISCOUNT_OPTIONS.map((d) => (
                          <button
                            key={d}
                            onClick={() => { setSelectedDiscount(d); setCustomDiscountInput('') }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                              ${selectedDiscount === d && customDiscountInput === ''
                                ? 'bg-terracotta-500 text-white shadow-sm'
                                : 'text-charcoal-500 hover:text-charcoal-700'}`}
                          >
                            {d === 0 ? 'No Discount' : `${Math.round(d * 100)}% Off`}
                          </button>
                        ))}
                        <div
                          className={`flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-lg transition-all
                            ${customDiscountInput !== '' ? 'bg-terracotta-500 shadow-sm' : ''}`}
                        >
                          <span className={`text-xs font-medium ${customDiscountInput !== '' ? 'text-white' : 'text-charcoal-500'}`}>
                            Custom
                          </span>
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
                              if (Number.isFinite(v)) setSelectedDiscount(Math.max(0, Math.min(95, v)) / 100)
                            }}
                            className={`w-11 px-1 py-0.5 text-xs rounded border-0 focus:outline-none focus:ring-1 focus:ring-terracotta-300
                              ${customDiscountInput !== '' ? 'bg-terracotta-400 text-white placeholder-terracotta-100' : 'bg-white text-charcoal-700'}`}
                          />
                          <span className={`text-xs ${customDiscountInput !== '' ? 'text-white' : 'text-charcoal-400'}`}>%</span>
                        </div>
                      </div>
                      <span className="text-xs text-charcoal-400 whitespace-nowrap">— default applied to every row below</span>
                    </div>
                  </div>

                  {/* Aggregate totals at the selected discount */}
                  <div className="grid grid-cols-3 gap-4 mb-5 pb-5 border-b border-sand-200">
                    <div>
                      <p className="text-xs text-charcoal-400">Potential Recovered Revenue</p>
                      <p className="text-lg font-serif font-semibold text-charcoal-700">{money(discountResult.recoveredRevenue)}</p>
                    </div>
                    <div>
                      <p
                        className="text-xs text-charcoal-400"
                        title="The cost of the on-hand stalled inventory itself — this is fixed by what's on the shelf and doesn't change as you adjust the discount %."
                      >
                        Cost Basis at Risk
                      </p>
                      <p className="text-lg font-serif font-semibold text-charcoal-700">{money(discountResult.costRecovered)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-charcoal-400">Net Margin</p>
                      <p className={`text-lg font-serif font-semibold ${discountResult.netMargin < 0 ? 'text-red-600' : 'text-olive-600'}`}>
                        {money(discountResult.netMargin)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className={`w-full min-w-[1080px] text-sm border-separate border-spacing-0 ${COLUMN_BAND_CLASS}`}>
                      <thead>
                        <tr className="text-left text-xs text-charcoal-400 uppercase tracking-wide border-b border-sand-200">
                          <th className="pb-3 pr-4 font-medium whitespace-nowrap">Product</th>
                          <th className="pb-3 px-4 font-medium text-right whitespace-nowrap">On Hand</th>
                          <th className="pb-3 px-4 font-medium text-right whitespace-nowrap">Selling Price</th>
                          <th className="pb-3 px-4 font-medium whitespace-nowrap">Cost</th>
                          <th className="pb-3 px-4 font-medium text-right whitespace-nowrap">Margin</th>
                          <th className="pb-3 px-4 font-medium text-right whitespace-nowrap">Discount %</th>
                          <th className="pb-3 px-4 font-medium text-right whitespace-nowrap">Price @ Discount</th>
                          <th className="pb-3 px-4 font-medium text-right whitespace-nowrap">Margin @ Discount</th>
                          <th className="pb-3 pl-4 font-medium text-right whitespace-nowrap" title="Units on hand × price at the discount above">Total Recovered</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sand-200">
                        {stalledDetailList.map((p, i) => {
                          const units = p.inventoryQuantity ?? 0
                          const cost = cogsFor(p)
                          const margin = marginFor(p, cost)
                          const rowDiscount = discountFor(p)
                          const hasOverride = rowDiscountOverrides[p.title] !== undefined
                          const discountedPrice = p.price != null ? p.price * (1 - rowDiscount) : null
                          const discountedMargin = discountedPrice != null && cost != null
                            ? { amount: discountedPrice - cost, percent: discountedPrice !== 0 ? ((discountedPrice - cost) / discountedPrice) * 100 : 0 }
                            : null
                          const recovery = discountedPrice != null ? units * discountedPrice : null
                          const belowCost = discountedMargin != null && discountedMargin.amount < 0
                          return (
                            <tr key={p.title} className={belowCost ? 'bg-red-50' : zebraClass(i)}>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                                  <div className="min-w-0">
                                    <ProductTitleButton product={p} onOpen={openProductDetail} className="text-sm text-charcoal-700 truncate max-w-[180px] block" />
                                    <p className="text-[10px] text-charcoal-300 whitespace-nowrap">
                                      {(() => {
                                        if (p.lastSoldAt) return `${daysSince(p.lastSoldAt)}d since last sale`
                                        const listedRef = p.publishedAt ?? p.createdAt
                                        return listedRef ? `Never sold — listed ${daysSince(listedRef)}d ago` : 'Never sold'
                                      })()}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right text-charcoal-700 whitespace-nowrap">{units.toLocaleString()}</td>
                              <td className="py-3 px-4 text-right text-charcoal-700 whitespace-nowrap">{p.price != null ? money(p.price) : '—'}</td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <CogsEditor
                                  productId={p.productId}
                                  sku={p.sku}
                                  nativeValue={p.nativeCogs}
                                  manualValue={manualCogsFor(p)}
                                  currency={currency}
                                  locale={locale}
                                  onAssign={handleCogsAssigned}
                                />
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap"><MarginLabel margin={margin} currency={currency} locale={locale} /></td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={95}
                                    value={Math.round(rowDiscount * 100)}
                                    onChange={(e) => {
                                      const v = Number(e.target.value)
                                      if (Number.isFinite(v)) setRowDiscount(p.title, Math.max(0, Math.min(95, v)) / 100)
                                    }}
                                    className={`w-14 px-1.5 py-1 text-xs border rounded-lg text-right focus:outline-none focus:border-terracotta-400
                                      ${hasOverride ? 'border-terracotta-300 bg-terracotta-100/40' : 'border-sand-300'}`}
                                  />
                                  <span className="text-[10px] text-charcoal-300">%</span>
                                  {hasOverride && (
                                    <button
                                      onClick={() => setRowDiscount(p.title, null)}
                                      className="text-[10px] text-charcoal-300 hover:text-red-400"
                                      title="Reset to the default discount"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right text-charcoal-700 whitespace-nowrap">{discountedPrice != null ? money(discountedPrice) : '—'}</td>
                              <td className="py-3 px-4 text-right whitespace-nowrap"><MarginLabel margin={discountedMargin} currency={currency} locale={locale} /></td>
                              <td className="py-3 pl-4 text-right text-charcoal-700 whitespace-nowrap">{recovery != null ? money(recovery) : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
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
          <div className="overflow-x-auto">
            <table className={`w-full min-w-[820px] text-sm border-separate border-spacing-0 ${COLUMN_BAND_CLASS}`}>
              <thead>
                <tr className="text-left text-xs text-charcoal-400 uppercase tracking-wide border-b border-sand-200">
                  <SortHeader label="Product" sortKeyValue="title" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Category" sortKeyValue="category" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Selling Price" sortKeyValue="price" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <th className="pb-3 px-4 font-medium whitespace-nowrap">Cost</th>
                  <SortHeader label="Margin" sortKeyValue="margin" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <th className="pb-3 px-4 font-medium text-right whitespace-nowrap">Sold</th>
                  <th className="pb-3 px-4 font-medium text-right whitespace-nowrap">On Hand</th>
                  <th className="pb-3 pl-4 font-medium text-right whitespace-nowrap">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {sortedProducts.map((p, i) => {
                  const stalled = p.inventoryQuantity != null && p.inventoryQuantity > 0 && p.unitsSold === 0
                    && isStalled(p, stalledThreshold)
                  const margin = marginFor(p, cogsFor(p))
                  return (
                    <tr key={p.title} className={zebraClass(i)}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                          <div className="min-w-0">
                            <button
                              onClick={() => openProductDetail(p)}
                              disabled={p.productId == null}
                              className="text-sm text-charcoal-700 truncate max-w-[200px] text-left hover:text-terracotta-600 hover:underline disabled:no-underline disabled:cursor-default block"
                              title={p.productId != null ? 'View related products' : undefined}
                            >
                              {p.title}
                            </button>
                            {p.vendor && <p className="text-[10px] text-charcoal-300 truncate">{p.vendor}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CategoryEditor title={p.title} assignedCategory={categoryFor(p)} onAssign={handleCategoryAssigned} />
                          {stalled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 whitespace-nowrap">
                              Stalled
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-charcoal-700 whitespace-nowrap">{p.price != null ? money(p.price) : '—'}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <CogsEditor
                          productId={p.productId}
                          sku={p.sku}
                          nativeValue={p.nativeCogs}
                          manualValue={manualCogsFor(p)}
                          currency={currency}
                          locale={locale}
                          onAssign={handleCogsAssigned}
                        />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap"><MarginLabel margin={margin} currency={currency} locale={locale} /></td>
                      <td className="py-3 px-4 text-right text-charcoal-700 whitespace-nowrap">{p.unitsSold.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-charcoal-700 whitespace-nowrap">
                        {p.inventoryQuantity != null ? p.inventoryQuantity.toLocaleString() : '—'}
                      </td>
                      <td className="py-3 pl-4 text-right text-charcoal-700 whitespace-nowrap">{money(p.revenue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Product Detail (related products & cross-sell) ───────────────── */}

      {!loading && !error && view === 'product-detail' && selectedProduct && (
        <>
          <BackButton onClick={() => setView('products')} label="Back to products" />
          <div className="flex items-center gap-3 mb-6">
            <ProductThumb imageUrl={selectedProduct.imageUrl} title={selectedProduct.title} />
            <h3 className="font-serif text-2xl text-charcoal-700 tracking-tight">{selectedProduct.title}</h3>
          </div>

          <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">Product Stats</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              <div>
                <p className="text-xs text-charcoal-400">Units Sold</p>
                <p className="text-lg font-serif font-semibold text-charcoal-700">{selectedProduct.unitsSold.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-charcoal-400">Revenue</p>
                <p className="text-lg font-serif font-semibold text-charcoal-700">{money(selectedProduct.revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-charcoal-400">On Hand</p>
                <p className="text-lg font-serif font-semibold text-charcoal-700">
                  {selectedProduct.inventoryQuantity != null ? selectedProduct.inventoryQuantity.toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-charcoal-400">Selling Price</p>
                <p className="text-lg font-serif font-semibold text-charcoal-700">
                  {selectedProduct.price != null ? money(selectedProduct.price) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-charcoal-400">Cost</p>
                <p className="text-lg font-serif font-semibold text-charcoal-700">
                  {(() => {
                    const c = cogsFor(selectedProduct)
                    return c != null ? money(c) : '—'
                  })()}
                </p>
              </div>
              <div>
                <p className="text-xs text-charcoal-400">Margin</p>
                <p className="text-lg font-serif font-semibold text-charcoal-700">
                  <MarginLabel margin={marginFor(selectedProduct, cogsFor(selectedProduct))} currency={currency} locale={locale} />
                </p>
              </div>
            </div>
          </div>

          {productDetailError && (
            <div className="flex items-center gap-3 p-4 mb-6 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <AlertCircle size={16} /> {productDetailError}
            </div>
          )}

          {loadingProductDetail ? (
            <LoadingSpinner label="Loading related products…" />
          ) : (
            <>
              <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400">
                    Related Products {relatedData?.computedAt ? `· updated ${formatDate(relatedData.computedAt)}` : '· not computed yet'}
                  </p>
                  <button
                    onClick={recomputeRelated}
                    disabled={recomputing}
                    className="flex items-center gap-1.5 text-xs text-charcoal-400 hover:text-terracotta-500 transition-colors px-2.5 py-1 rounded-lg hover:bg-terracotta-100 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={recomputing ? 'animate-spin' : ''} /> Recompute
                  </button>
                </div>
                {relatedEntries.length === 0 ? (
                  <p className="text-sm text-charcoal-400 italic py-6 text-center">
                    No related products yet — click Recompute, or this product has no shared collections or frequently
                    co-purchased items (min. 3 shared orders).
                  </p>
                ) : (
                  <ul className="divide-y divide-sand-200">
                    {relatedEntries.map((entry, i) => {
                      const relatedProduct = productsById.get(entry.relatedProductId)
                      return (
                        <li key={`${entry.relationType}-${entry.relatedProductId}`} className={`py-2.5 px-2 rounded-lg flex items-center gap-3 ${zebraClass(i)}`}>
                          <ProductThumb imageUrl={relatedProduct?.imageUrl ?? null} title={relatedProduct?.title ?? entry.relatedProductId} />
                          {relatedProduct ? (
                            <ProductTitleButton product={relatedProduct} onOpen={openProductDetail} className="flex-1 min-w-0 text-sm text-charcoal-700 truncate" />
                          ) : (
                            <span className="flex-1 min-w-0 text-sm text-charcoal-700 truncate">
                              {`Product #${entry.relatedProductId}`}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap
                              ${entry.relationType === 'same-tag'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-olive-100 text-olive-600 border-olive-200'}`}
                          >
                            {entry.relationType === 'same-tag' ? 'Same Tag' : `Frequently Bought Together ×${entry.coPurchaseCount}`}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-card p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">Might Be Interested</p>

                <div className="mb-5 pb-5 border-b border-sand-200">
                  <p className="text-lg font-serif font-semibold text-charcoal-700">
                    {interestedData?.total ?? 0} customer{(interestedData?.total ?? 0) === 1 ? '' : 's'}
                    <span className="text-sm font-sans font-normal text-charcoal-400">
                      {' '}· {customerSharePercent.toFixed(1)}% of your {interestedData?.totalCustomers ?? 0} customers
                    </span>
                  </p>
                  <p className="text-[11px] text-charcoal-300 mt-0.5">
                    {interestedData?.consented ?? 0} have marketing consent and are eligible for a segment
                  </p>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-charcoal-400 whitespace-nowrap">If</span>
                    <div className="flex items-center gap-1 bg-sand-100 p-1 rounded-xl flex-wrap">
                      {CONVERSION_OPTIONS.map((c) => (
                        <button
                          key={c}
                          onClick={() => { setConversionRate(c); setCustomConversionInput('') }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                            ${conversionRate === c && customConversionInput === ''
                              ? 'bg-terracotta-500 text-white shadow-sm'
                              : 'text-charcoal-500 hover:text-charcoal-700'}`}
                        >
                          {Math.round(c * 100)}%
                        </button>
                      ))}
                      <div
                        className={`flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-lg transition-all
                          ${customConversionInput !== '' ? 'bg-terracotta-500 shadow-sm' : ''}`}
                      >
                        <span className={`text-xs font-medium ${customConversionInput !== '' ? 'text-white' : 'text-charcoal-500'}`}>
                          Custom
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="%"
                          value={customConversionInput}
                          onChange={(e) => {
                            const raw = e.target.value
                            setCustomConversionInput(raw)
                            const v = parseFloat(raw)
                            if (Number.isFinite(v)) setConversionRate(Math.max(0, Math.min(100, v)) / 100)
                          }}
                          className={`w-11 px-1 py-0.5 text-xs rounded border-0 focus:outline-none focus:ring-1 focus:ring-terracotta-300
                            ${customConversionInput !== '' ? 'bg-terracotta-400 text-white placeholder-terracotta-100' : 'bg-white text-charcoal-700'}`}
                        />
                        <span className={`text-xs ${customConversionInput !== '' ? 'text-white' : 'text-charcoal-400'}`}>%</span>
                      </div>
                    </div>
                    <span className="text-xs text-charcoal-400 whitespace-nowrap">convert:</span>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-serif font-semibold text-olive-600">{money(estimatedRevenue)}</p>
                    <p className="text-[11px] text-charcoal-300">estimated potential revenue for this product — not a guaranteed figure</p>
                  </div>
                </div>

                {segmentConfirming ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm text-charcoal-700 mb-3">
                      This will create a segment in Omnisend named <strong>Might buy: {selectedProduct.title}</strong>,
                      tagging <strong>{consentedEmails.length}</strong> consented customer{consentedEmails.length === 1 ? '' : 's'} out
                      of {interestedData?.total ?? 0} total who bought a related product. Non-consented customers are never
                      included.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCreateSegment(selectedProduct, consentedEmails)}
                        disabled={creatingSegment}
                        className="flex items-center gap-2 text-sm font-medium text-white bg-terracotta-500 hover:bg-terracotta-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                      >
                        {creatingSegment && <Loader2 size={14} className="animate-spin" />}
                        Confirm & Create
                      </button>
                      <button
                        onClick={() => setSegmentConfirming(false)}
                        disabled={creatingSegment}
                        className="text-sm text-charcoal-400 hover:text-charcoal-600 px-4 py-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setSegmentConfirming(true)}
                    disabled={consentedEmails.length === 0}
                    className="text-sm font-medium text-white bg-terracotta-500 hover:bg-terracotta-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
                  >
                    Create Segment
                  </button>
                )}

                {segmentResult && (
                  <p className={`flex items-center gap-2 text-sm mt-3 ${segmentResult.ok ? 'text-olive-600' : 'text-red-600'}`}>
                    {segmentResult.message}
                  </p>
                )}
              </div>
            </>
          )}
        </>
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
                  <p className="font-medium text-charcoal-700">{money(revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-400">Units on Hand</p>
                  <p className="font-medium text-charcoal-700">{inventoryAvailable ? inventoryUnits.toLocaleString() : '—'}</p>
                </div>
              </div>
              <ul className="divide-y divide-sand-200">
                {items.map((p, i) => (
                  <li key={p.title} className={`py-2.5 px-2 rounded-lg flex items-center gap-3 ${zebraClass(i)}`}>
                    <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                    <ProductTitleButton product={p} onOpen={openProductDetail} className="flex-1 min-w-0 text-sm text-charcoal-700 truncate" />
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
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 flex items-center gap-1.5">
                  <TrendingUp size={12} /> Best Sellers — {bestSellerPeriod === 'week' ? 'Trailing 7 Days' : 'Trailing 30 Days'}
                </p>
                <p className="text-[11px] text-charcoal-300 mt-1">
                  {bestSellers.length} product{bestSellers.length === 1 ? '' : 's'} with sales in this period
                  {bestSellers.length < 5 && ' — more will show up here as sales come in.'}
                </p>
              </div>
              <ul className="divide-y divide-sand-200">
                {bestSellers.map((p, i) => {
                  const units = bestSellerPeriod === 'week' ? p.unitsSoldWeek : p.unitsSoldMonth
                  const lowStock = p.inventoryQuantity != null && p.inventoryQuantity <= LOW_STOCK_THRESHOLD
                  return (
                    <li key={p.title} className={`py-3 px-2 rounded-lg flex items-center gap-3 ${zebraClass(i)}`}>
                      <span className="w-5 shrink-0 text-sm font-serif font-semibold text-charcoal-300">{i + 1}</span>
                      <ProductThumb imageUrl={p.imageUrl} title={p.title} />
                      <div className="flex-1 min-w-0">
                        <ProductTitleButton product={p} onOpen={openProductDetail} className="text-sm text-charcoal-700 truncate block" />
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
                        <p className="text-xs text-charcoal-400">{money(p.revenue)} total</p>
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

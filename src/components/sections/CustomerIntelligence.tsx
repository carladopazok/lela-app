'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Search, RefreshCw, AlertCircle, Tag, CheckCircle2, Loader2,
  X, Check, Lock, ChevronDown, ShoppingBag, Mail, Package, ExternalLink,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import TagBadge from '@/components/ui/TagBadge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MaskedEmail, { HideAllEmailsButton } from '@/components/ui/MaskedEmail'
import CollapsibleCard from '@/components/ui/CollapsibleCard'
import RFMAnalysis from '@/components/sections/RFMAnalysis'
import Segments from '@/components/sections/Segments'
import CustomerJourney from '@/components/sections/CustomerJourney'
import { LOYAL_MIN_ORDERS, VIP_MIN_ORDERS, AT_RISK_START_DAYS, LAPSED_START_DAYS, LOST_DAYS, ABANDONED_CHECKOUT_WINDOW_DAYS } from '@/lib/segmentation'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import type { EnrichedCustomer, ShopifyOrder, CSTicket, RelatedProductsData } from '@/types'
import { CUSTOMER_TAGS } from '@/types'

interface RelatedProductLookup {
  title: string
  imageUrl: string | null
}

function formatDate(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmt(n: number) {
  return `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Tags actually pushed to Shopify/Omnisend on sync: behavioral tags (the single
// segmentation.ts stage tag + abandoned-checkout), one per purchased product
// category, and country — so every segment shown in the Segments tab is
// targetable as a real tag in campaigns. Deliberately excludes the RFM cohort —
// that was a second, independently-computed label (quintile-relative, not fixed
// thresholds) that could disagree with the stage tag above; segmentation.ts is
// the only per-customer classification synced externally now. RFM Analysis
// itself is untouched, just no longer surfaced or synced per customer here.
function syncableTags(c: EnrichedCustomer): string[] {
  return [
    ...c.computedTags,
    ...c.manualTags,
    ...c.productTags.map((t) => `category-${t}`),
    ...(c.country ? [`country-${c.country}`] : []),
  ]
}

const TICKET_STATUS_STYLES: Record<string, string> = {
  open:              'bg-terracotta-100 text-terracotta-700 border border-terracotta-200',
  'needs attention': 'bg-amber-50 text-amber-700 border border-amber-200',
  archived:          'bg-sand-100 text-charcoal-500 border border-sand-300',
  resolved:          'bg-olive-100 text-olive-600 border border-olive-200',
  spam:              'bg-red-50 text-red-600 border border-red-200',
}

// ─── Expanded row detail ──────────────────────────────────────────────────────

function CustomerExpandedDetail({
  customer,
  customTagTypes,
  productCategories,
  tickets,
  relatedProductsData,
  productLookup,
  onTagToggled,
  onTagCreated,
  onCategoryAssigned,
  onNavigateToTicket,
  onNavigateToProduct,
}: {
  customer: EnrichedCustomer
  customTagTypes: string[]
  productCategories: Record<string, string>
  tickets: CSTicket[]
  relatedProductsData: RelatedProductsData | null
  productLookup: Map<string, RelatedProductLookup>
  onTagToggled: (customer: EnrichedCustomer, tag: string) => Promise<void>
  onTagCreated: (tag: string) => void
  onCategoryAssigned: (title: string, category: string | null) => void
  onNavigateToTicket?: (ticketId: string) => void
  onNavigateToProduct?: (productId: number) => void
}) {
  const [orders, setOrders] = useState<ShopifyOrder[]>([])
  const [shop, setShop] = useState<string | null>(null)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [addingTag, setAddingTag] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')
  const [savingTag, setSavingTag] = useState(false)
  const [localCustomer, setLocalCustomer] = useState(customer)
  const [showOrders, setShowOrders] = useState(false)
  const [addingToSegment, setAddingToSegment] = useState<string | null>(null)
  const [segmentAddedFor, setSegmentAddedFor] = useState<Set<string>>(new Set())
  const [editingCategoryFor, setEditingCategoryFor] = useState<string | null>(null)
  const [categoryInput, setCategoryInput] = useState('')
  const { includeDummy } = useDummyData()

  useEffect(() => {
    fetch(withDummyParam(`/api/shopify/customers/${customer.id}/orders`, includeDummy))
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setOrdersError(d.error); setOrders([]) }
        else { setOrders(d.orders ?? []); setShop(d.shop ?? null) }
        setLoadingOrders(false)
      })
      .catch((e) => { setOrdersError(e.message ?? 'Failed to load orders'); setLoadingOrders(false) })
  }, [customer.id, includeDummy])

  async function toggleTag(tag: string) {
    if (localCustomer.computedTags.includes(tag)) return
    const next = localCustomer.manualTags.includes(tag)
      ? localCustomer.manualTags.filter((t) => t !== tag)
      : [...localCustomer.manualTags, tag]
    const updated = { ...localCustomer, manualTags: next }
    setLocalCustomer(updated)
    await onTagToggled(updated, tag)
  }

  async function createTag() {
    const tag = newTagValue.trim().toLowerCase()
    if (!tag) return
    setSavingTag(true)
    await fetch('/api/shopify/customer-tag-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tag }),
    })
    onTagCreated(tag)
    setNewTagValue('')
    setAddingTag(false)
    setSavingTag(false)
  }

  const allTagTypes = [...CUSTOMER_TAGS, ...customTagTypes]

  const products = useMemo(() => {
    const map = new Map<string, { qty: number; image_url: string | null; category: string; productId: number | null }>()
    for (const order of orders) {
      for (const item of order.line_items ?? []) {
        const existing = map.get(item.title)
        if (existing) {
          existing.qty += item.quantity
        } else {
          const category = item.tags && item.tags.length > 0
            ? item.tags.join(', ')
            : item.product_type?.trim() || ''
          map.set(item.title, {
            qty: item.quantity,
            image_url: item.image_url ?? null,
            category,
            productId: item.product_id ?? null,
          })
        }
      }
    }
    return Array.from(map.entries())
      .map(([title, data]) => ({ title, ...data }))
      .sort((a, b) => b.qty - a.qty)
  }, [orders])

  const purchasedCategories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))],
    [products],
  )

  const purchasedProductIds = useMemo(() => {
    const set = new Set<string>()
    for (const order of orders) {
      for (const item of order.line_items ?? []) {
        if (item.product_id != null) set.add(String(item.product_id))
      }
    }
    return set
  }, [orders])

  // Reuses the same relation cache computed for Products & Inventory's Product Detail
  // screen (data/related-products.json) — no second computation.
  const suggestedProducts = useMemo(() => {
    if (!relatedProductsData) return []
    const suggestedIds = new Set<string>()
    for (const productId of purchasedProductIds) {
      for (const entry of relatedProductsData.relations[productId] ?? []) {
        if (!purchasedProductIds.has(entry.relatedProductId)) suggestedIds.add(entry.relatedProductId)
      }
    }
    return [...suggestedIds]
      .map((id) => ({ id, ...productLookup.get(id) }))
      .filter((p): p is { id: string; title: string; imageUrl: string | null } => p.title != null)
  }, [relatedProductsData, purchasedProductIds, productLookup])

  const consented = customer.email_marketing_consent?.state === 'subscribed'

  async function addToProductSegment(productId: string, productTitle: string) {
    if (!customer.email || !consented) return
    setAddingToSegment(productId)
    try {
      const res = await fetch(`/api/shopify/products/${productId}/create-segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerEmails: [customer.email], productTitle }),
      })
      if (res.ok) setSegmentAddedFor((prev) => new Set(prev).add(productId))
    } finally {
      setAddingToSegment(null)
    }
  }

  return (
    <div className="p-5 bg-sand-50">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total Spent', value: fmt(parseFloat(customer.total_spent)) },
          { label: 'Orders', value: String(customer.orders_count) },
          { label: 'AOV', value: fmt(customer.aov) },
          { label: 'Last Order', value: formatDate(customer.lastOrderDate) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl p-3 shadow-sm">
            <p className="text-xs text-charcoal-400 mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-charcoal-700">{value}</p>
          </div>
        ))}
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <p className="text-xs text-charcoal-400 mb-1">Email Marketing</p>
          {(() => {
            const state = customer.email_marketing_consent?.state ?? 'not_subscribed'
            const map: Record<string, { label: string; classes: string }> = {
              subscribed:     { label: 'Subscribed',     classes: 'bg-olive-100 text-olive-600' },
              pending:        { label: 'Pending',        classes: 'bg-amber-50 text-amber-700' },
              unsubscribed:   { label: 'Unsubscribed',   classes: 'bg-red-50 text-red-600' },
              not_subscribed: { label: 'Not subscribed', classes: 'bg-sand-100 text-charcoal-500' },
            }
            const cfg = map[state] ?? map.not_subscribed
            return (
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.classes}`}>
                {cfg.label}
              </span>
            )
          })()}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        {/* Tags */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {allTagTypes.map((tag) => {
              const isComputed = localCustomer.computedTags.includes(tag)
              const isManual = localCustomer.manualTags.includes(tag)
              const isActive = isComputed || isManual
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  disabled={isComputed}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all capitalize
                    ${isActive ? 'bg-terracotta-500 text-white border-terracotta-500' : 'bg-white text-charcoal-500 border-sand-300 hover:border-terracotta-300 hover:text-terracotta-600'}
                    ${isComputed ? 'opacity-80 cursor-default' : ''}`}
                >
                  {isComputed && <Lock size={8} className="opacity-70" />}
                  {tag}
                  {isManual && (
                    <X size={9} className="opacity-70 hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); toggleTag(tag) }}
                    />
                  )}
                </button>
              )
            })}
            {addingTag ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  type="text"
                  value={newTagValue}
                  onChange={(e) => setNewTagValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createTag()
                    if (e.key === 'Escape') { setAddingTag(false); setNewTagValue('') }
                  }}
                  placeholder="New tag…"
                  className="px-2 py-0.5 text-xs border border-terracotta-300 rounded-full focus:outline-none w-24"
                />
                <button onClick={createTag} disabled={savingTag || !newTagValue.trim()} className="p-0.5 text-terracotta-500 disabled:opacity-40">
                  {savingTag ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                </button>
                <button onClick={() => { setAddingTag(false); setNewTagValue('') }} className="p-0.5 text-charcoal-400">
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingTag(true)}
                className="px-2 py-0.5 rounded-full text-xs border border-dashed border-sand-400 text-charcoal-400 hover:border-terracotta-300 hover:text-terracotta-500 transition-all"
              >
                + New
              </button>
            )}
          </div>
        </div>

        {/* Products */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 flex items-center gap-1.5">
              <Package size={11} /> Products
            </p>
            {purchasedCategories.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                {purchasedCategories.map((cat) => (
                  <span key={cat} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
          {loadingOrders ? (
            <p className="text-xs text-charcoal-400">Loading…</p>
          ) : ordersError ? (
            <p className="text-xs text-red-400 italic">Error: {ordersError}</p>
          ) : products.length === 0 ? (
            <p className="text-xs text-charcoal-300 italic">No purchases yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {products.map((p) => {
                const assignedCat = productCategories[p.title] || p.category
                const isEditing = editingCategoryFor === p.title
                return (
                  <li key={p.title}>
                    <div className="flex items-center gap-2">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt={p.title} className="w-8 h-8 rounded object-cover shrink-0 border border-sand-200" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-sand-100 border border-sand-200 shrink-0 flex items-center justify-center">
                          <Package size={12} className="text-charcoal-300" />
                        </div>
                      )}
                      {p.productId != null && onNavigateToProduct ? (
                        <button
                          onClick={() => onNavigateToProduct(p.productId as number)}
                          title="View product details"
                          className="text-xs text-charcoal-600 flex-1 truncate text-left hover:text-terracotta-600 hover:underline transition-colors"
                        >
                          {p.title}
                        </button>
                      ) : (
                        <span className="text-xs text-charcoal-600 flex-1 truncate">{p.title}</span>
                      )}
                      <span className="shrink-0 text-xs text-charcoal-400">×{p.qty}</span>
                    </div>
                    <div className="ml-10 mt-1">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            type="text"
                            value={categoryInput}
                            onChange={(e) => setCategoryInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && categoryInput.trim()) {
                                onCategoryAssigned(p.title, categoryInput.trim())
                                setEditingCategoryFor(null)
                                setCategoryInput('')
                              }
                              if (e.key === 'Escape') { setEditingCategoryFor(null); setCategoryInput('') }
                            }}
                            placeholder="e.g. Accessories"
                            className="px-2 py-0.5 text-xs border border-indigo-300 rounded-full focus:outline-none w-28"
                          />
                          <button
                            onClick={() => {
                              if (categoryInput.trim()) {
                                onCategoryAssigned(p.title, categoryInput.trim())
                                setEditingCategoryFor(null)
                                setCategoryInput('')
                              }
                            }}
                            className="p-0.5 text-indigo-500"
                          >
                            <Check size={11} />
                          </button>
                          <button onClick={() => { setEditingCategoryFor(null); setCategoryInput('') }} className="p-0.5 text-charcoal-400">
                            <X size={11} />
                          </button>
                        </div>
                      ) : assignedCat ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {assignedCat}
                          </span>
                          <button
                            onClick={() => { setEditingCategoryFor(p.title); setCategoryInput(assignedCat) }}
                            className="text-[10px] text-charcoal-300 hover:text-charcoal-500"
                          >
                            edit
                          </button>
                          <button
                            onClick={() => onCategoryAssigned(p.title, null)}
                            className="text-[10px] text-charcoal-300 hover:text-red-400"
                          >
                            remove
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingCategoryFor(p.title); setCategoryInput('') }}
                          className="text-[10px] text-charcoal-300 hover:text-indigo-500 border border-dashed border-charcoal-200 hover:border-indigo-300 px-1.5 py-0.5 rounded-full transition-colors"
                        >
                          + assign category
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Abandoned Checkouts */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3 flex items-center gap-1.5">
            <AlertCircle size={11} /> Abandoned Checkouts
          </p>
          {customer.abandonedCheckouts.length === 0 ? (
            <p className="text-xs text-charcoal-300 italic">None.</p>
          ) : (
            <ul className="space-y-2.5">
              {customer.abandonedCheckouts
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((co) => (
                  <li key={co.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-charcoal-600">{formatDate(co.createdAt)}</span>
                      <span className="font-medium text-charcoal-700">{fmt(parseFloat(co.totalPrice))}</span>
                    </div>
                    <p className="text-charcoal-400 truncate mt-0.5">
                      {co.lineItems.map((li) => li.title).join(', ') || 'No items'}
                    </p>
                    {co.recoveryUrl && (
                      <a
                        href={co.recoveryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 text-red-500 hover:text-red-600 hover:underline mt-0.5"
                      >
                        Recovery link <ExternalLink size={9} className="opacity-60" />
                      </a>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Tickets */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3 flex items-center gap-1.5">
            <Mail size={11} /> Tickets
          </p>
          {tickets.length === 0 ? (
            <p className="text-xs text-charcoal-300 italic">No tickets.</p>
          ) : (
            <ul className="space-y-1.5">
              {tickets
                .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
                .map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => onNavigateToTicket?.(t.id)}
                      className="w-full flex items-center justify-between gap-2 text-xs text-left hover:text-terracotta-600 transition-colors"
                    >
                      <span className="text-charcoal-600 truncate">{t.subject}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-xs font-medium capitalize ${TICKET_STATUS_STYLES[t.status] ?? 'bg-sand-100 text-charcoal-500'}`}>
                        {t.status}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {/* Might Be Interested In — cross-sell suggestions from related-products data */}
      {suggestedProducts.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3 flex items-center gap-1.5">
            <Package size={11} /> Might Be Interested In
          </p>
          <ul className="space-y-2">
            {suggestedProducts.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.title} className="w-7 h-7 rounded object-cover shrink-0 border border-sand-200" />
                ) : (
                  <div className="w-7 h-7 rounded bg-sand-100 border border-sand-200 shrink-0 flex items-center justify-center">
                    <Package size={11} className="text-charcoal-300" />
                  </div>
                )}
                {onNavigateToProduct ? (
                  <button
                    onClick={() => onNavigateToProduct(Number(p.id))}
                    title="View product details"
                    className="flex-1 min-w-0 text-xs text-charcoal-600 truncate text-left hover:text-terracotta-600 hover:underline transition-colors"
                  >
                    {p.title}
                  </button>
                ) : (
                  <span className="flex-1 min-w-0 text-xs text-charcoal-600 truncate">{p.title}</span>
                )}
                {segmentAddedFor.has(p.id) ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-olive-100 text-olive-600 shrink-0">Added</span>
                ) : (
                  <button
                    onClick={() => addToProductSegment(p.id, p.title)}
                    disabled={!consented || addingToSegment === p.id}
                    title={consented ? 'Add this customer to this product’s Omnisend segment' : 'No marketing consent — cannot add to a segment'}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-sand-300 text-charcoal-500 hover:border-terracotta-300 hover:text-terracotta-600 transition-colors disabled:opacity-40 shrink-0"
                  >
                    {addingToSegment === p.id ? 'Adding…' : 'Add to Segment'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Order history (collapsible) */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowOrders((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-widest text-charcoal-400 hover:bg-sand-50 transition-colors"
        >
          <span className="flex items-center gap-1.5"><ShoppingBag size={11} /> Order History ({orders.length})</span>
          <ChevronDown size={13} className={`transition-transform ${showOrders ? 'rotate-180' : ''}`} />
        </button>
        {showOrders && (
          <div className="px-4 pb-4 divide-y divide-sand-100">
            {loadingOrders ? (
              <p className="text-xs text-charcoal-400 py-3">Loading…</p>
            ) : ordersError ? (
              <p className="text-xs text-red-400 italic py-3">Error: {ordersError}</p>
            ) : orders.length === 0 ? (
              <p className="text-xs text-charcoal-300 italic py-3">No orders.</p>
            ) : (
              orders
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((order) => (
                  <div key={order.id} className="py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {shop ? (
                          <a
                            href={`https://${shop}/admin/orders/${order.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-semibold text-terracotta-600 hover:text-terracotta-700 hover:underline flex items-center gap-0.5"
                          >
                            {order.name}<ExternalLink size={9} className="opacity-60" />
                          </a>
                        ) : (
                          <span className="text-xs font-semibold text-charcoal-700">{order.name}</span>
                        )}
                        <span className="text-xs text-charcoal-400">{formatDate(order.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-charcoal-700">{fmt(parseFloat(order.total_price))}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          order.financial_status === 'paid' ? 'bg-olive-100 text-olive-600' :
                          order.financial_status === 'refunded' ? 'bg-red-50 text-red-600' :
                          'bg-sand-100 text-charcoal-500'
                        }`}>{order.financial_status}</span>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {(order.line_items ?? []).map((item) => (
                        <li key={item.id} className="flex items-center gap-2 text-xs text-charcoal-500">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image_url} alt={item.title} className="w-6 h-6 rounded object-cover shrink-0 border border-sand-200" />
                          ) : (
                            <div className="w-6 h-6 rounded bg-sand-100 border border-sand-200 shrink-0" />
                          )}
                          <span className="flex-1 truncate">{item.title}{item.variant_title ? ` — ${item.variant_title}` : ''}</span>
                          <span className="shrink-0 text-charcoal-400">×{item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main section ─────────────────────────────────────────────────────────────

export default function CustomerIntelligence({
  openCustomerEmail,
  onOpenCustomerHandled,
  onNavigateToTicket,
  onNavigateToProduct,
  initialView,
  onInitialViewHandled,
  onNavigateToEmailAttribution,
}: {
  openCustomerEmail?: string | null
  onOpenCustomerHandled?: () => void
  onNavigateToTicket?: (ticketId: string) => void
  onNavigateToProduct?: (productId: number) => void
  initialView?: 'journey' | null
  onInitialViewHandled?: () => void
  onNavigateToEmailAttribution?: () => void
} = {}) {
  const [customers, setCustomers] = useState<EnrichedCustomer[]>([])
  const [customTagTypes, setCustomTagTypes] = useState<string[]>([])
  const [productCategories, setProductCategories] = useState<Record<string, string>>({})
  const [tickets, setTickets] = useState<CSTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [syncedIds, setSyncedIds] = useState<Set<number>>(new Set())
  const [bulkSyncing, setBulkSyncing] = useState(false)
  const [cleaningTags, setCleaningTags] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{ checked: number; shopifyCleaned: number; omnisendCleaned: number; errors: unknown[] } | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [activeView, setActiveView] = useState<'customers' | 'rfm' | 'segments' | 'journey'>('customers')
  const [taggingLogicOpen, setTaggingLogicOpen] = useState(false)
  const [addingTagFor, setAddingTagFor] = useState<number | null>(null)
  const [addTagValue, setAddTagValue] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'orders' | 'aov' | 'lastOrder' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [hiddenEmailIds, setHiddenEmailIds] = useState<Set<number>>(new Set())
  const [relatedProductsData, setRelatedProductsData] = useState<RelatedProductsData | null>(null)
  const [productLookup, setProductLookup] = useState<Map<string, RelatedProductLookup>>(new Map())
  const { includeDummy } = useDummyData()

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [custRes, typesRes, catRes, ticketRes, relatedRes, productsRes] = await Promise.all([
        fetch(withDummyParam('/api/shopify/customers', includeDummy)),
        fetch('/api/shopify/customer-tag-types'),
        fetch('/api/shopify/product-categories'),
        fetch(withDummyParam('/api/cs/tickets', includeDummy)),
        fetch('/api/shopify/related-products'),
        fetch(withDummyParam('/api/shopify/products', includeDummy)),
      ])
      const custData = await custRes.json()
      const typesData = await typesRes.json()
      const catData = await catRes.json()
      const ticketData = await ticketRes.json()
      const relatedData = await relatedRes.json()
      const productsData = await productsRes.json()
      if (!custRes.ok) throw new Error(custData.error)
      setCustomers(custData.customers)
      setCustomTagTypes(typesData.types ?? [])
      setProductCategories(catData.categories ?? {})
      setTickets(ticketData.tickets ?? [])
      setRelatedProductsData(relatedRes.ok ? relatedData : null)
      const lookup = new Map<string, RelatedProductLookup>()
      for (const p of productsData.products ?? []) {
        if (p.productId != null) lookup.set(String(p.productId), { title: p.title, imageUrl: p.imageUrl })
      }
      setProductLookup(lookup)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [includeDummy])

  useEffect(() => {
    if (!openCustomerEmail || loading) return
    const found = customers.find((c) => c.email.toLowerCase() === openCustomerEmail.toLowerCase())
    if (found) {
      setExpandedId(found.id)
      document.getElementById(`customer-row-${found.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    onOpenCustomerHandled?.()
  }, [openCustomerEmail, loading, customers, onOpenCustomerHandled])

  useEffect(() => {
    if (!initialView) return
    setActiveView(initialView)
    onInitialViewHandled?.()
  }, [initialView, onInitialViewHandled])

  const ticketsByEmail = useMemo(() => {
    const map = new Map<string, CSTicket[]>()
    for (const t of tickets) {
      const key = t.from.toLowerCase()
      const list = map.get(key) ?? []
      list.push(t)
      map.set(key, list)
    }
    return map
  }, [tickets])

  function toggleEmailVisibility(id: number, e: React.MouseEvent) {
    e.stopPropagation()
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

  async function handleCategoryAssigned(title: string, category: string | null) {
    if (category) {
      const res = await fetch('/api/shopify/product-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category }),
      })
      const data = await res.json()
      setProductCategories(data.categories ?? {})
    } else {
      const res = await fetch('/api/shopify/product-categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await res.json()
      setProductCategories(data.categories ?? {})
    }
    // Refresh customers so productTags reflects the new category
    const custRes = await fetch(withDummyParam('/api/shopify/customers', includeDummy))
    const custData = await custRes.json()
    if (custData.customers) setCustomers(custData.customers)
  }

  const filtered = useMemo(() => {
    if (!query) return customers
    return customers.filter(
      (c) =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(query.toLowerCase()) ||
        c.email.toLowerCase().includes(query.toLowerCase())
    )
  }, [customers, query])

  function handleSort(key: 'name' | 'orders' | 'aov' | 'lastOrder') {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      } else if (sortKey === 'orders') {
        cmp = a.orders_count - b.orders_count
      } else if (sortKey === 'aov') {
        cmp = a.aov - b.aov
      } else if (sortKey === 'lastOrder') {
        const da = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0
        const db = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0
        cmp = da - db
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  async function toggleManualTag(customer: EnrichedCustomer, tag: string) {
    if (customer.computedTags.includes(tag)) return
    const next = customer.manualTags.includes(tag)
      ? customer.manualTags.filter((t) => t !== tag)
      : [...customer.manualTags, tag]
    await fetch(`/api/shopify/customers/${customer.id}/manual-tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualTags: next }),
    })
    setCustomers((prev) => prev.map((c) => c.id === customer.id ? { ...c, manualTags: next } : c))
    setSyncedIds((prev) => { const n = new Set(prev); n.delete(customer.id); return n })
  }

  async function addTagToCustomer(customer: EnrichedCustomer, rawTag: string) {
    const tag = rawTag.trim().toLowerCase()
    if (!tag) return
    if (customer.manualTags.includes(tag) || customer.computedTags.includes(tag)) {
      setAddingTagFor(null)
      setAddTagValue('')
      return
    }
    const allKnown = [...CUSTOMER_TAGS, ...customTagTypes]
    if (!allKnown.includes(tag)) {
      await fetch('/api/shopify/customer-tag-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tag }),
      })
      setCustomTagTypes((prev) => (prev.includes(tag) ? prev : [...prev, tag]))
    }
    const next = [...customer.manualTags, tag]
    await fetch(`/api/shopify/customers/${customer.id}/manual-tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualTags: next }),
    })
    setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, manualTags: next } : c)))
    setSyncedIds((prev) => { const n = new Set(prev); n.delete(customer.id); return n })
    setAddingTagFor(null)
    setAddTagValue('')
  }

  async function syncCustomerTags(customer: EnrichedCustomer, e: React.MouseEvent) {
    e.stopPropagation()
    setSyncingId(customer.id)
    const allTags = syncableTags(customer)
    try {
      await fetch(`/api/shopify/customers/${customer.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: allTags, existingTags: customer.tags }),
      })
      if (customer.email) {
        await fetch(`/api/omnisend/contacts/${encodeURIComponent(customer.email)}/tags`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: allTags }),
        })
      }
      setSyncedIds((prev) => new Set(Array.from(prev).concat(customer.id)))
    } finally {
      setSyncingId(null)
    }
  }

  async function syncAllTags() {
    setBulkSyncing(true)
    for (const c of customers.filter((c) => c.computedTags.length > 0 || c.manualTags.length > 0 || c.productTags.length > 0)) {
      const allTags = syncableTags(c)
      await fetch(`/api/shopify/customers/${c.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: allTags, existingTags: c.tags }),
      })
      if (c.email) {
        await fetch(`/api/omnisend/contacts/${encodeURIComponent(c.email)}/tags`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: allTags }),
        })
      }
      setSyncedIds((prev) => new Set(Array.from(prev).concat(c.id)))
    }
    setBulkSyncing(false)
  }

  // One-time migration: removes lela-cohort-* tags left on real Shopify/Omnisend
  // records by syncs that ran before the RFM cohort stopped being pushed as an
  // external tag (see syncableTags() above). Safe to click more than once.
  async function cleanUpCohortTags() {
    setCleaningTags(true)
    setCleanupResult(null)
    try {
      const res = await fetch('/api/cleanup-cohort-tags', { method: 'POST' })
      const data = await res.json()
      if (res.ok) setCleanupResult(data)
    } finally {
      setCleaningTags(false)
    }
  }

  const taggedCount = customers.filter((c) => c.computedTags.length > 0 || c.manualTags.length > 0 || c.productTags.length > 0).length

  return (
    <section className={activeView === 'journey' ? 'max-w-full' : 'max-w-4xl'}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Customer Intelligence</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">
            {activeView === 'customers'
              ? 'Click any customer to see their full profile'
              : activeView === 'rfm'
              ? 'RFM — Recency · Frequency · Monetary scoring'
              : activeView === 'segments'
              ? 'Segments by product purchased, cohort, and customer tag'
              : 'Lifecycle stages and the automations that should fire at each one'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && activeView === 'customers' && (
            <button
              onClick={cleanUpCohortTags}
              disabled={cleaningTags}
              title="One-time cleanup: removes stale lela-cohort-* tags left by old syncs"
              className="flex items-center gap-2 text-sm font-medium text-charcoal-500 border border-sand-300 hover:bg-cream-100 px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {cleaningTags ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
              Clean Up Stale Cohort Tags
            </button>
          )}
          {!loading && taggedCount > 0 && activeView === 'customers' && (
            <button
              onClick={syncAllTags}
              disabled={bulkSyncing}
              className="flex items-center gap-2 text-sm font-medium text-white bg-olive-500 hover:bg-olive-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {bulkSyncing ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
              Sync All Tags
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-terracotta-100 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {cleanupResult && (
        <div className="text-sm bg-white rounded-xl shadow-card px-4 py-3 mb-4">
          <p className="text-charcoal-700">
            Checked <strong>{cleanupResult.checked}</strong> customers · cleaned <strong>{cleanupResult.shopifyCleaned}</strong> on
            Shopify, <strong>{cleanupResult.omnisendCleaned}</strong> on Omnisend
            {cleanupResult.errors.length > 0 && <> · <strong className="text-red-600">{cleanupResult.errors.length}</strong> error{cleanupResult.errors.length === 1 ? '' : 's'}</>}
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-sand-100 p-1 rounded-xl w-fit">
        {(['customers', 'rfm', 'segments', 'journey'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all capitalize
              ${activeView === view ? 'bg-white text-charcoal-700 shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
          >
            {view === 'rfm' ? 'RFM Analysis' : view === 'segments' ? 'Segments' : view === 'journey' ? 'Journey' : 'Customers'}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner label="Loading customers…" />}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!loading && !error && activeView === 'rfm' && (
        <RFMAnalysis customers={customers} onNavigateToJourney={() => setActiveView('journey')} />
      )}

      {!loading && !error && activeView === 'segments' && (
        <Segments customers={customers} customTagTypes={customTagTypes} />
      )}

      {!loading && !error && activeView === 'journey' && (
        <CustomerJourney customers={customers} onNavigateToEmailAttribution={onNavigateToEmailAttribution} />
      )}

      {!loading && !error && activeView === 'customers' && (
        <>
          {/* Tag logic legend */}
          <div className="mb-6">
            <CollapsibleCard
              label="Tagging Logic"
              isOpen={taggingLogicOpen}
              onToggle={() => setTaggingLogicOpen((v) => !v)}
            >
              <div className="grid grid-cols-2 gap-3 text-sm text-charcoal-500">
                <div className="flex items-start gap-2"><TagBadge tag="never-purchased" /><span>0 orders</span></div>
                <div className="flex items-start gap-2"><TagBadge tag="1-order" /><span>Exactly 1 order, within {AT_RISK_START_DAYS} days</span></div>
                <div className="flex items-start gap-2"><TagBadge tag="active" /><span>2–{LOYAL_MIN_ORDERS - 1} orders, most recent within {AT_RISK_START_DAYS} days</span></div>
                <div className="flex items-start gap-2"><TagBadge tag="winback" /><span>Exactly 1 order, {AT_RISK_START_DAYS}–{LAPSED_START_DAYS - 1} days since it</span></div>
                <div className="flex items-start gap-2"><TagBadge tag="loyal" /><span>{LOYAL_MIN_ORDERS}–{VIP_MIN_ORDERS - 1} orders, most recent within {AT_RISK_START_DAYS} days</span></div>
                <div className="flex items-start gap-2"><TagBadge tag="VIP" /><span>{VIP_MIN_ORDERS}+ orders, most recent within {LOST_DAYS} days</span></div>
                <div className="flex items-start gap-2"><TagBadge tag="at-risk" /><span>2+ orders (below VIP), {AT_RISK_START_DAYS}–{LAPSED_START_DAYS - 1} days since last order</span></div>
                <div className="flex items-start gap-2"><TagBadge tag="lapsed" /><span>{LAPSED_START_DAYS}–{LOST_DAYS - 1} days since last order</span></div>
                <div className="flex items-start gap-2"><TagBadge tag="lost" /><span>{LOST_DAYS}+ days since last order, or unsubscribed</span></div>
                <div className="flex items-start gap-2"><TagBadge tag="abandoned-checkout" /><span>Open checkout within the last {ABANDONED_CHECKOUT_WINDOW_DAYS} days (independent of the tags above)</span></div>
              </div>
            </CollapsibleCard>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-sand-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta-200 focus:border-terracotta-400 transition-all placeholder:text-charcoal-400"
            />
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-charcoal-400">
              Showing {filtered.length} of {customers.length} customers
            </p>
            <HideAllEmailsButton allHidden={allEmailsHidden} onClick={toggleAllEmails} />
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-charcoal-400">
              <p className="font-medium">No customers match</p>
              <p className="text-sm mt-1">Try a different search term.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sand-100 text-left">
                    <th className="w-6 pl-4 py-3"></th>
                    {(
                      [
                        { key: 'name',      label: 'Customer' },
                        { key: 'orders',    label: 'Orders' },
                        { key: 'aov',       label: 'AOV' },
                        { key: 'lastOrder', label: 'Last Order' },
                      ] as const
                    ).map(({ key, label }) => (
                      <th key={key} className="px-4 py-3">
                        <button
                          onClick={() => handleSort(key)}
                          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-charcoal-400 hover:text-charcoal-600 transition-colors"
                        >
                          {label}
                          {sortKey === key
                            ? sortDir === 'asc'
                              ? <ArrowUp size={11} className="text-terracotta-500" />
                              : <ArrowDown size={11} className="text-terracotta-500" />
                            : <ArrowUpDown size={11} className="opacity-30" />}
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Tickets</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Tags</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400 text-right">Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-200">
                  {sorted.map((c) => {
                    const allTags = syncableTags(c)
                    const isExpanded = expandedId === c.id
                    const isEmailHidden = hiddenEmailIds.has(c.id)
                    const customerTickets = ticketsByEmail.get(c.email.toLowerCase()) ?? []
                    return (
                      <>
                        <tr
                          key={c.id}
                          id={`customer-row-${c.id}`}
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-sand-50' : 'hover:bg-cream-100'}`}
                        >
                          <td className="pl-4 pr-1 py-4 text-charcoal-300">
                            <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-medium text-charcoal-700">{c.first_name} {c.last_name}</p>
                            <p className="text-xs text-charcoal-400 mt-0.5 flex items-center gap-1.5">
                              <MaskedEmail
                                email={c.email}
                                hidden={isEmailHidden}
                                onToggle={(e) => toggleEmailVisibility(c.id, e)}
                              />
                              {c.email_marketing_consent?.state === 'subscribed' && (
                                <span className="px-1.5 py-0 rounded-full text-[10px] font-medium bg-olive-100 text-olive-600">✉ sub</span>
                              )}
                            </p>
                            {(() => {
                              if (c.productTags.length === 0 && !c.country) return null
                              return (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {c.country && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200">
                                      {c.country}
                                    </span>
                                  )}
                                  {c.productTags.map((tag) => (
                                    <span
                                      key={`cat-${tag}`}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-4 text-charcoal-700 font-medium">{c.orders_count}</td>
                          <td className="px-4 py-4 text-charcoal-700">€{c.aov.toFixed(2)}</td>
                          <td className="px-4 py-4 text-charcoal-500">{formatDate(c.lastOrderDate)}</td>
                          <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                            {customerTickets.length === 0 ? (
                              <span className="text-xs text-charcoal-300">—</span>
                            ) : (
                              <button
                                onClick={() => {
                                  const mostRecent = [...customerTickets].sort(
                                    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
                                  )[0]
                                  onNavigateToTicket?.(mostRecent.id)
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg bg-sand-100 text-charcoal-500 hover:bg-terracotta-100 hover:text-terracotta-600 transition-colors"
                              >
                                <Mail size={11} />
                                {customerTickets.length}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap gap-1 items-center">
                              {c.computedTags.map((tag) => (
                                <TagBadge key={tag} tag={tag} />
                              ))}
                              {c.manualTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-terracotta-500 text-white"
                                >
                                  {tag}
                                  <button
                                    onClick={() => toggleManualTag(c, tag)}
                                    className="opacity-70 hover:opacity-100 ml-0.5"
                                  >
                                    <X size={9} />
                                  </button>
                                </span>
                              ))}
                              {c.computedTags.length === 0 && c.manualTags.length === 0 && addingTagFor !== c.id && (
                                <span className="text-xs text-charcoal-300">—</span>
                              )}
                              {addingTagFor === c.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    autoFocus
                                    type="text"
                                    value={addTagValue}
                                    list={`tag-suggestions-${c.id}`}
                                    onChange={(e) => setAddTagValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') addTagToCustomer(c, addTagValue)
                                      if (e.key === 'Escape') { setAddingTagFor(null); setAddTagValue('') }
                                    }}
                                    placeholder="Tag name…"
                                    className="px-2 py-0.5 text-xs border border-terracotta-300 rounded-full focus:outline-none w-24"
                                  />
                                  <datalist id={`tag-suggestions-${c.id}`}>
                                    {[...CUSTOMER_TAGS, ...customTagTypes]
                                      .filter((t) => !c.manualTags.includes(t) && !c.computedTags.includes(t))
                                      .map((t) => <option key={t} value={t} />)}
                                  </datalist>
                                  <button
                                    onClick={() => addTagToCustomer(c, addTagValue)}
                                    className="p-0.5 text-terracotta-500 disabled:opacity-40"
                                    disabled={!addTagValue.trim()}
                                  >
                                    <Check size={11} />
                                  </button>
                                  <button
                                    onClick={() => { setAddingTagFor(null); setAddTagValue('') }}
                                    className="p-0.5 text-charcoal-400"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setAddingTagFor(c.id); setAddTagValue('') }}
                                  className="px-1.5 py-0.5 rounded-full text-[10px] border border-dashed border-sand-400 text-charcoal-400 hover:border-terracotta-300 hover:text-terracotta-500 transition-all"
                                >
                                  + tag
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            {allTags.length > 0 && (
                              <button
                                onClick={(e) => syncCustomerTags(c, e)}
                                disabled={syncingId === c.id || bulkSyncing}
                                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 hover:bg-olive-100 text-olive-600 hover:text-olive-700"
                              >
                                {syncedIds.has(c.id) ? (
                                  <><CheckCircle2 size={12} className="text-green-600" /> Synced</>
                                ) : syncingId === c.id ? (
                                  <><Loader2 size={12} className="animate-spin" /> Syncing…</>
                                ) : (
                                  <><Tag size={12} /> Sync</>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${c.id}-expanded`}>
                            <td colSpan={8} className="border-b border-sand-200">
                              <CustomerExpandedDetail
                                customer={c}
                                customTagTypes={customTagTypes}
                                productCategories={productCategories}
                                tickets={customerTickets}
                                relatedProductsData={relatedProductsData}
                                productLookup={productLookup}
                                onTagToggled={toggleManualTag}
                                onTagCreated={(tag) => setCustomTagTypes((prev) => prev.includes(tag) ? prev : [...prev, tag])}
                                onCategoryAssigned={handleCategoryAssigned}
                                onNavigateToTicket={onNavigateToTicket}
                                onNavigateToProduct={onNavigateToProduct}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}


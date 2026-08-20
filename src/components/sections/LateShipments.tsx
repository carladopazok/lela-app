'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, RefreshCw, Loader2, Check, Mail, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MaskedEmail, { HideAllEmailsButton } from '@/components/ui/MaskedEmail'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import type { LateShipment } from '@/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STOCK_BADGE: Record<LateShipment['stockStatus'], string> = {
  'in-stock': 'bg-olive-100 text-olive-600 border border-olive-200',
  'sold-out': 'bg-red-100 text-red-700 border border-red-200',
  'backordered': 'bg-amber-100 text-amber-700 border border-amber-200',
  'unknown': 'bg-sand-100 text-charcoal-500 border border-sand-300',
}

const STOCK_LABEL: Record<LateShipment['stockStatus'], string> = {
  'in-stock': 'In Stock',
  'sold-out': 'Sold Out',
  'backordered': 'Backordered',
  'unknown': 'Unknown',
}

type SortKey = 'order' | 'customer' | 'placed' | 'daysLate' | 'total' | 'stock'

function orderNumber(orderName: string): number {
  return parseInt(orderName.replace(/[^0-9]/g, ''), 10) || 0
}
type SortDir = 'asc' | 'desc'

function SortableTh({
  label,
  sortKeyValue,
  activeKey,
  dir,
  onSort,
  align = 'left',
}: {
  label: string
  sortKeyValue: SortKey
  activeKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = activeKey === sortKeyValue
  return (
    <th className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400 ${align === 'right' ? 'text-right' : 'text-left'}`}>
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

export default function LateShipments({
  onBackToSalesOverview,
  onNavigateToTicket,
}: {
  onBackToSalesOverview?: () => void
  onNavigateToTicket?: (ticketId: string, draftBody?: string) => void
} = {}) {
  const [shipments, setShipments] = useState<LateShipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionState, setActionState] = useState<Record<number, 'working' | 'sent' | 'error'>>({})
  const [hiddenEmails, setHiddenEmails] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('daysLate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const { includeDummy } = useDummyData()

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedShipments = useMemo(() => {
    const sorted = [...shipments].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'order': cmp = orderNumber(a.orderName) - orderNumber(b.orderName); break
        case 'customer': cmp = a.customerName.localeCompare(b.customerName); break
        case 'placed': cmp = a.createdAt.localeCompare(b.createdAt); break
        case 'daysLate': cmp = a.daysLate - b.daysLate; break
        case 'total': cmp = parseFloat(a.totalPrice) - parseFloat(b.totalPrice); break
        case 'stock': cmp = STOCK_LABEL[a.stockStatus].localeCompare(STOCK_LABEL[b.stockStatus]); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [shipments, sortKey, sortDir])

  function toggleEmailVisibility(email: string) {
    const key = email.toLowerCase()
    setHiddenEmails((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const allEmailsHidden = shipments.length > 0 && shipments.every((s) => hiddenEmails.has(s.customerEmail.toLowerCase()))
  function toggleAllEmails() {
    setHiddenEmails(allEmailsHidden ? new Set() : new Set(shipments.map((s) => s.customerEmail.toLowerCase())))
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(withDummyParam('/api/shopify/late-shipments', includeDummy))
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShipments(data.shipments)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [includeDummy])

  async function contactCustomer(s: LateShipment) {
    setActionState((p) => ({ ...p, [s.id]: 'working' }))
    try {
      const res = await fetch('/api/shopify/late-shipments/sold-out-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderName: s.orderName,
          customerEmail: s.customerEmail,
          customerName: s.customerName,
          items: s.items.filter((i) => i.short === true),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionState((p) => { const n = { ...p }; delete n[s.id]; return n })
      onNavigateToTicket?.(data.ticket.id, data.draftBody)
    } catch {
      setActionState((p) => ({ ...p, [s.id]: 'error' }))
    }
  }

  async function notifyBackorder(s: LateShipment) {
    setActionState((p) => ({ ...p, [s.id]: 'working' }))
    try {
      const res = await fetch('/api/shopify/late-shipments/backorder-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderName: s.orderName,
          customerEmail: s.customerEmail,
          customerName: s.customerName,
          items: s.items.filter((i) => i.short === true && (i.availableQty ?? 0) > 0),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionState((p) => { const n = { ...p }; delete n[s.id]; return n })
      onNavigateToTicket?.(data.ticket.id, data.draftBody)
    } catch {
      setActionState((p) => ({ ...p, [s.id]: 'error' }))
    }
  }

  async function notifyDelay(s: LateShipment) {
    setActionState((p) => ({ ...p, [s.id]: 'working' }))
    try {
      const res = await fetch('/api/shopify/late-shipments/notify-delay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderName: s.orderName,
          customerEmail: s.customerEmail,
          customerName: s.customerName,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionState((p) => { const n = { ...p }; delete n[s.id]; return n })
      onNavigateToTicket?.(data.ticket.id, data.draftBody)
    } catch {
      setActionState((p) => ({ ...p, [s.id]: 'error' }))
    }
  }

  return (
    <section className="max-w-6xl">
      {onBackToSalesOverview && (
        <button
          onClick={onBackToSalesOverview}
          className="flex items-center gap-1.5 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors mb-4"
        >
          <ArrowLeft size={14} /> Back to Sales Overview
        </button>
      )}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Late Shipments</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">Open orders unfulfilled for more than 5 days</p>
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

      {loading && <LoadingSpinner label="Fetching orders…" />}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!loading && !error && shipments.length === 0 && (
        <div className="text-center py-20 text-charcoal-400">
          <p className="text-4xl mb-3">🎉</p>
          <p className="font-medium">No late shipments</p>
          <p className="text-sm mt-1">All open orders are within the 5-day window.</p>
        </div>
      )}

      {!loading && !error && shipments.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-sand-200">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-terracotta-500" />
              <span className="text-sm font-medium text-charcoal-500">{shipments.length} order{shipments.length !== 1 ? 's' : ''} need attention</span>
            </div>
            <HideAllEmailsButton allHidden={allEmailsHidden} onClick={toggleAllEmails} />
          </div>

          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-sand-100 text-left">
                <SortableTh label="Order" sortKeyValue="order" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Customer" sortKeyValue="customer" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Placed" sortKeyValue="placed" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Days Late" sortKeyValue="daysLate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Items</th>
                <SortableTh label="Total" sortKeyValue="total" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                <SortableTh label="Stock" sortKeyValue="stock" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {sortedShipments.map((s) => {
                const state = actionState[s.id]
                return (
                <tr key={s.id} className="hover:bg-cream-100 transition-colors">
                  <td className="px-6 py-4 font-medium text-terracotta-600">{s.orderName}</td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-charcoal-700">{s.customerName}</p>
                    <p className="text-xs text-charcoal-400 mt-0.5">
                      <MaskedEmail
                        email={s.customerEmail}
                        hidden={hiddenEmails.has(s.customerEmail.toLowerCase())}
                        onToggle={() => toggleEmailVisibility(s.customerEmail)}
                      />
                    </p>
                  </td>
                  <td className="px-6 py-4 text-charcoal-500">{formatDate(s.createdAt)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
                      ${s.daysLate >= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {s.daysLate}d
                    </span>
                  </td>
                  <td className="px-6 py-4 text-charcoal-500 max-w-xs">
                    {s.items.map((item, i) => (
                      <span key={i} className="block truncate">
                        {item.quantity}× {item.title}
                      </span>
                    ))}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-charcoal-700">€{parseFloat(s.totalPrice).toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STOCK_BADGE[s.stockStatus]}`}>
                      {STOCK_LABEL[s.stockStatus]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {s.contactedAt && (
                      <p className="flex items-center gap-1 text-xs text-olive-600 mb-1">
                        <Check size={11} /> Contacted {formatDate(s.contactedAt)}
                      </p>
                    )}
                    {s.stockStatus === 'sold-out' && (
                      <button
                        onClick={() => contactCustomer(s)}
                        disabled={state === 'working' || !!s.contactedAt}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-terracotta-100 text-terracotta-600 hover:bg-terracotta-200 transition-colors disabled:opacity-40 disabled:bg-sand-100 disabled:text-charcoal-400 disabled:hover:bg-sand-100 disabled:cursor-not-allowed"
                      >
                        {state === 'working' ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                        Contact Customer
                      </button>
                    )}
                    {s.stockStatus === 'backordered' && (
                      <button
                        onClick={() => notifyBackorder(s)}
                        disabled={state === 'working' || !!s.contactedAt}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors disabled:opacity-40 disabled:bg-sand-100 disabled:text-charcoal-400 disabled:hover:bg-sand-100 disabled:cursor-not-allowed"
                      >
                        {state === 'working' ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                        Notify Backorder
                      </button>
                    )}
                    {s.stockStatus === 'in-stock' && (
                      <button
                        onClick={() => notifyDelay(s)}
                        disabled={state === 'working' || !!s.contactedAt}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-olive-100 text-olive-600 hover:bg-olive-200 transition-colors disabled:opacity-40 disabled:bg-sand-100 disabled:text-charcoal-400 disabled:hover:bg-sand-100 disabled:cursor-not-allowed"
                      >
                        {state === 'working' ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                        Notify Delay
                      </button>
                    )}
                    {s.stockStatus === 'unknown' && (
                      <span className="text-xs text-charcoal-400">Inventory unavailable</span>
                    )}
                    {state === 'error' && <p className="text-xs text-red-600 mt-1">Failed — try again</p>}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </section>
  )
}

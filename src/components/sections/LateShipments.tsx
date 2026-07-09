'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import type { LateShipment } from '@/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function LateShipments() {
  const [shipments, setShipments] = useState<LateShipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { includeDummy } = useDummyData()

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

  return (
    <section className="max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Late Shipments</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">Open orders unfulfilled for more than 3 days</p>
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
          <p className="text-sm mt-1">All open orders are within the 3-day window.</p>
        </div>
      )}

      {!loading && !error && shipments.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-sand-200">
            <AlertCircle size={15} className="text-terracotta-500" />
            <span className="text-sm font-medium text-charcoal-500">{shipments.length} order{shipments.length !== 1 ? 's' : ''} need attention</span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-100 text-left">
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Order</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Customer</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Placed</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Days Late</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Items</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {shipments.map((s) => (
                <tr key={s.id} className="hover:bg-cream-100 transition-colors">
                  <td className="px-6 py-4 font-medium text-terracotta-600">{s.orderName}</td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-charcoal-700">{s.customerName}</p>
                    <p className="text-xs text-charcoal-400 mt-0.5">{s.customerEmail}</p>
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
                  <td className="px-6 py-4 text-right font-medium text-charcoal-700">${parseFloat(s.totalPrice).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

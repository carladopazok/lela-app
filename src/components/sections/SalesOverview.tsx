'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, Truck, Clock, ReceiptText, ExternalLink } from 'lucide-react'
import StatCard from '@/components/ui/StatCard'
import AttentionCard from '@/components/ui/AttentionCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import { isSoldOutLive, getStalledUnitsSummary, getBestSeller } from '@/lib/product-metrics'
import type { SalesMetrics, ProductSummary } from '@/types'

function fmt(n: number, currency: string) {
  return n.toLocaleString('es-ES', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PERIODS: { label: string; days: number }[] = [
  { label: 'Today',    days: 0   },
  { label: 'Last 30d', days: 30  },
  { label: 'Last 60d', days: 60  },
  { label: 'Last 90d', days: 90  },
  { label: 'Last 365d',days: 365 },
  { label: 'All Time', days: -1  },
]

function periodSubtitle(days: number) {
  if (days === 0) return 'Today — paid orders'
  if (days === -1) return 'All time — paid orders'
  return `Last ${days} days — paid orders`
}

// "Immediately preceding period of the same length" — Today's prior is just yesterday
// (a single day), and All Time has no well-defined prior period at all.
function endDaysAgoFor(days: number): number | null {
  if (days === -1) return null
  if (days === 0) return 1
  return days
}

function priorPeriodLabel(days: number): string {
  return days === 0 ? 'day' : `${days}d`
}

function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) return null
  return ((current - prior) / prior) * 100
}

function trendFor(current: number, prior: number, days: number): { direction: 'up' | 'down'; text: string } | null {
  const pct = pctDelta(current, prior)
  if (pct === null) return null
  const direction = pct >= 0 ? 'up' : 'down'
  const sign = pct >= 0 ? '+' : ''
  return { direction, text: `${sign}${pct.toFixed(0)}% vs prior ${priorPeriodLabel(days)}` }
}

interface SalesOverviewProps {
  onGoToLateShipments?: () => void
  onGoToProductsFiltered?: (filter: 'soldout' | 'stalled') => void
  onGoToBestSellers?: () => void
}

export default function SalesOverview({
  onGoToLateShipments,
  onGoToProductsFiltered,
  onGoToBestSellers,
}: SalesOverviewProps = {}) {
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null)
  const [priorMetrics, setPriorMetrics] = useState<SalesMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeDays, setActiveDays] = useState(30)
  const { includeDummy } = useDummyData()

  const [lateCount, setLateCount] = useState<number | null>(null)
  const [lateError, setLateError] = useState<string | null>(null)

  const [products, setProducts] = useState<ProductSummary[]>([])
  const [productsAvailable, setProductsAvailable] = useState(false)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [shop, setShop] = useState<string | null>(null)

  const [conversionRate, setConversionRate] = useState<number | null>(null)
  const [conversionSessions, setConversionSessions] = useState<number | null>(null)
  const [conversionError, setConversionError] = useState<string | null>(null)

  async function load(days: number) {
    setLoading(true)
    setError(null)
    try {
      const endDaysAgo = endDaysAgoFor(days)
      const [currentRes, priorRes] = await Promise.all([
        fetch(withDummyParam(`/api/shopify/sales-overview?days=${days}`, includeDummy)),
        endDaysAgo == null
          ? Promise.resolve(null)
          : fetch(withDummyParam(`/api/shopify/sales-overview?days=${days}&endDaysAgo=${endDaysAgo}`, includeDummy)),
      ])

      const data = await currentRes.json()
      if (!currentRes.ok) throw new Error(data.error)
      setMetrics(data)

      if (priorRes) {
        const priorData = await priorRes.json()
        setPriorMetrics(priorRes.ok ? priorData : null)
      } else {
        setPriorMetrics(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function loadLateShipments() {
    try {
      const res = await fetch(withDummyParam('/api/shopify/late-shipments', includeDummy))
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLateCount(data.shipments.length)
    } catch (e) {
      setLateError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  async function loadProducts() {
    try {
      const res = await fetch(withDummyParam('/api/shopify/products', includeDummy))
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProducts(data.products ?? [])
      setProductsAvailable(data.inventoryAvailable ?? false)
      setShop(data.shop ?? null)
    } catch (e) {
      setProductsError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  async function loadConversionRate(days: number) {
    setConversionError(null)
    try {
      const res = await fetch(`/api/shopify/conversion-rate?days=${days}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setConversionRate(data.conversionRate)
      setConversionSessions(data.sessions)
    } catch (e) {
      setConversionError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load(activeDays) }, [activeDays, includeDummy])
  useEffect(() => { loadLateShipments() }, [includeDummy])
  useEffect(() => { loadProducts() }, [includeDummy])
  useEffect(() => { loadConversionRate(activeDays) }, [activeDays])

  const stalledSummary = useMemo(() => getStalledUnitsSummary(products), [products])
  const soldOutCount = useMemo(() => products.filter(isSoldOutLive).length, [products])
  const bestSeller = useMemo(() => getBestSeller(products), [products])

  const productsUnavailable = productsError != null || !productsAvailable
  const refundRateUnavailable = error != null || !metrics || metrics.totalRevenue === 0

  function handlePeriod(days: number) {
    setActiveDays(days)
  }

  return (
    <section className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Sales Overview</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">{periodSubtitle(activeDays)}</p>
        </div>
        <button
          onClick={() => load(activeDays)}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-terracotta-100 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-8">
        {PERIODS.map(({ label, days }) => (
          <button
            key={days}
            onClick={() => handlePeriod(days)}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50
              ${activeDays === days
                ? 'bg-terracotta-500 text-white shadow-sm'
                : 'bg-white border border-sand-300 text-charcoal-500 hover:bg-sand-100 hover:border-sand-400'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner label="Pulling sales data…" />}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!loading && !error && metrics && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard
              label="Total Revenue"
              value={fmt(metrics.totalRevenue, metrics.currency)}
              sub={periodSubtitle(activeDays)}
              accent
              trend={priorMetrics ? trendFor(metrics.totalRevenue, priorMetrics.totalRevenue, activeDays) ?? undefined : undefined}
            />
            <StatCard
              label="Orders"
              value={metrics.orderCount.toLocaleString()}
              sub="paid orders"
              trend={priorMetrics ? trendFor(metrics.orderCount, priorMetrics.orderCount, activeDays) ?? undefined : undefined}
            />
            <StatCard
              label="Avg. Order Value"
              value={fmt(metrics.aov, metrics.currency)}
              sub="total revenue ÷ orders"
              trend={priorMetrics ? trendFor(metrics.aov, priorMetrics.aov, activeDays) ?? undefined : undefined}
            />
            <StatCard
              label="Total Refunds"
              value={fmt(metrics.totalRefunds, metrics.currency)}
              sub="full &amp; partial refunds"
            />
            <StatCard
              label="Conversion Rate"
              value={conversionRate != null ? `${conversionRate.toFixed(1)}%` : '—'}
              sub={
                conversionError
                  ? 'needs session data'
                  : conversionSessions != null
                    ? `${conversionSessions.toLocaleString()} sessions`
                    : periodSubtitle(activeDays)
              }
            />
          </div>

          <div className="mb-4">
            <h3 className="text-[13px] text-charcoal-400 mb-3">Needs attention</h3>
            <div className="grid grid-cols-4 gap-4">
              <AttentionCard
                icon={Truck}
                tone="danger"
                label="Late Shipments"
                value={(lateCount ?? 0).toLocaleString()}
                unavailable={lateError != null}
                actionLabel="See in detail"
                onAction={() => onGoToLateShipments?.()}
              />
              <AttentionCard
                icon={Clock}
                tone="warning"
                label="Stalled Inventory"
                value={`${stalledSummary.units.toLocaleString()} units`}
                caption={`${fmt(stalledSummary.potentialRevenue, metrics.currency)} potential revenue`}
                unavailable={productsUnavailable}
                actionLabel="See in detail"
                onAction={() => onGoToProductsFiltered?.('stalled')}
              />
              <AttentionCard
                icon={AlertCircle}
                tone="warning"
                label="Sold Out, Still Live"
                value={soldOutCount.toLocaleString()}
                unavailable={productsUnavailable}
                actionLabel="Create restock alert"
                // TODO: placeholder for now — navigates to the sold-out filter, same as the
                // other cards. The full restock-waitlist campaign flow (mirroring
                // StalledCampaignPanel: audience = past purchasers of that exact product, tag
                // lela-restock-{productId}, Omnisend segment "Restock: {title}") is deferred.
                onAction={() => onGoToProductsFiltered?.('soldout')}
              />
              {/* No "See in detail" link for now — there's no refund-rate detail view to send
                  someone to yet (Customer Service only tracks a "refund" ticket tag, not this
                  order-level rate). Revisit once/if that lands. */}
              <AttentionCard
                icon={ReceiptText}
                tone="danger"
                label="Refund Rate"
                value={metrics.totalRevenue > 0 ? `${((metrics.totalRefunds / metrics.totalRevenue) * 100).toFixed(1)}%` : '—'}
                unavailable={refundRateUnavailable}
              />
            </div>
          </div>

          {!productsUnavailable && bestSeller && (
            <div className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-4 mb-6">
              {bestSeller.imageUrl
                ? <img src={bestSeller.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                : <div className="w-12 h-12 rounded-lg bg-sand-200" />}
              <div className="flex-1">
                <p className="text-xs font-medium uppercase tracking-widest text-charcoal-400">Most sold product</p>
                <p className="text-sm text-charcoal-700 mt-0.5 flex items-center gap-1">
                  {bestSeller.title} · {bestSeller.unitsSoldWeek} sold
                  {shop && bestSeller.productId != null && (
                    <a
                      href={`https://${shop}/admin/products/${bestSeller.productId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on Shopify"
                      className="shrink-0 text-charcoal-300 hover:text-terracotta-500 transition-colors"
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                </p>
              </div>
              <button
                onClick={() => onGoToBestSellers?.()}
                className="text-xs font-medium text-terracotta-500 hover:text-terracotta-600 transition-colors"
              >
                See in detail →
              </button>
            </div>
          )}

          {metrics.orderCount > 0 && (
            <div className="bg-white rounded-2xl shadow-card p-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">Health Snapshot</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-charcoal-500">Refund rate</span>
                  <span className="font-medium text-charcoal-700">
                    {metrics.totalRevenue > 0
                      ? `${((metrics.totalRefunds / metrics.totalRevenue) * 100).toFixed(1)}%`
                      : '—'}
                  </span>
                </div>
                <div className="w-full bg-sand-200 rounded-full h-1.5">
                  <div
                    className="bg-terracotta-500 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min((metrics.totalRefunds / Math.max(metrics.totalRevenue, 1)) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

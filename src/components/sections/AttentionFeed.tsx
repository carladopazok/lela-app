'use client'

import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { RefreshCw, AlertCircle, AlertTriangle, CheckCircle2, Truck, Clock, Mail, UserMinus, GitBranch, Inbox } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import { isSoldOutLive, getStalledUnitsSummary, getLowRunwaySummary, getReturnRiskSummary } from '@/lib/product-metrics'
import { computeRFM } from '@/lib/rfm'
import { DEMO_DELIVERABILITY_TREND, type DemoDeliverabilityPoint } from '@/lib/email-performance-demo'
import type { EnrichedCustomer, CSTicket, LateShipment, ProductSummary } from '@/types'

// Aggregates alerts that are already computed inside their own tabs — this component
// does no calculation of its own beyond simple sums/counts/comparisons over data each
// tab already produces. See each entry below for exactly which source it reuses.
interface RealTransition {
  matchedFlow: string | null
}

interface FeedEntry {
  key: string
  icon: LucideIcon
  tone: 'danger' | 'warning'
  text: string
  detail?: string
  valueLabel: string
  monetaryValue: number | null
  countValue: number
  onClick?: () => void
}

function fmt(n: number, currency: string) {
  return n.toLocaleString('es-ES', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface AttentionFeedProps {
  onGoToLateShipments?: () => void
  onGoToProductsFiltered?: (filter: 'soldout' | 'stalled' | 'lowrunway' | 'returnrisk') => void
  onGoToEmailDeliverability?: () => void
  onGoToCustomerIntelligenceRFM?: () => void
  onGoToCustomerJourney?: () => void
  onGoToCustomerService?: () => void
}

export default function AttentionFeed({
  onGoToLateShipments,
  onGoToProductsFiltered,
  onGoToEmailDeliverability,
  onGoToCustomerIntelligenceRFM,
  onGoToCustomerJourney,
  onGoToCustomerService,
}: AttentionFeedProps = {}) {
  const { includeDummy } = useDummyData()
  const [loading, setLoading] = useState(true)

  const [currency, setCurrency] = useState('EUR')

  // Late Shipments: reuses /api/shopify/late-shipments, same source LateShipments.tsx
  // reads — count and total order value at risk are simple aggregates over its response.
  const [lateShipments, setLateShipments] = useState<LateShipment[]>([])
  const [lateUnavailable, setLateUnavailable] = useState(false)

  // Products & Inventory: reuses /api/shopify/products plus the shared isStalled/
  // isSoldOutLive predicates and getStalledUnitsSummary() aggregate from
  // src/lib/product-metrics.ts — the exact same functions SalesOverview.tsx uses.
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [productsUnavailable, setProductsUnavailable] = useState(false)
  const [returnsAvailable, setReturnsAvailable] = useState(false)

  // Deliverability: reuses EmailDeliverability.tsx's own real/demo toggle and its exact
  // first-vs-last direction comparison. Flag mirrors the condition behind that tab's
  // existing "drifted the wrong direction" copy — only true when all three metrics worsened.
  const [deliverabilityFlag, setDeliverabilityFlag] = useState(false)

  // RFM: reuses the shared computeRFM() classifier (src/lib/rfm.ts), same one RFMAnalysis.tsx
  // uses. No "estimated lifetime value" field exists anywhere in the app (confirmed — only
  // historical total_spent), so per the brief that half of this entry is skipped, count-only.
  const [atRiskCount, setAtRiskCount] = useState<number | null>(null)

  // Journey/Stage Attribution: reuses /api/customer-stage-history's matchedFlow field,
  // already computed server-side by matchFlowForTransition().
  const [unmatchedTransitions, setUnmatchedTransitions] = useState<number | null>(null)

  // Customer Service: reuses CSTicket.status. Tickets carry no SKU/root-cause field (only
  // an optional relatedOrderName), so grouping by shared root cause would need cross-
  // referencing Shopify order line items — out of scope per the brief, skipped.
  const [openTicketCount, setOpenTicketCount] = useState<number | null>(null)

  async function load() {
    setLoading(true)

    const lateP = fetch(withDummyParam('/api/shopify/late-shipments', includeDummy))
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error)
        setLateShipments(data.shipments ?? [])
        setLateUnavailable(false)
      })
      .catch(() => setLateUnavailable(true))

    const productsP = fetch(withDummyParam('/api/shopify/products', includeDummy))
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error)
        setProducts(data.products ?? [])
        setProductsUnavailable(!(data.inventoryAvailable ?? false))
        setReturnsAvailable(data.returnsAvailable ?? false)
        setCurrency(data.currency ?? 'EUR')
      })
      .catch(() => setProductsUnavailable(true))

    const deliverabilityP = (async () => {
      try {
        const useRealData = window.localStorage.getItem('lela_email_perf_real_data') === '1'
        let trend: DemoDeliverabilityPoint[]
        if (useRealData) {
          const res = await fetch('/api/omnisend/analytics/deliverability')
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          trend = data.trend ?? []
        } else {
          trend = DEMO_DELIVERABILITY_TREND
        }
        const first = trend[0]
        const last = trend[trend.length - 1]
        const worsened = !!first && !!last
          && last.bounceRate >= first.bounceRate
          && last.complaintRate >= first.complaintRate
          && last.unsubscribeRate >= first.unsubscribeRate
        setDeliverabilityFlag(worsened)
      } catch {
        setDeliverabilityFlag(false)
      }
    })()

    const rfmP = fetch(withDummyParam('/api/shopify/customers', includeDummy))
      .then((r) => r.json())
      .then((data) => {
        const customers: EnrichedCustomer[] = data.customers ?? []
        const scored = computeRFM(customers)
        setAtRiskCount(scored.filter((c) => c.segment === 'At Risk').length)
      })
      .catch(() => setAtRiskCount(null))

    const journeyP = fetch('/api/customer-stage-history')
      .then((r) => r.json())
      .then((data) => {
        const transitions: RealTransition[] = data.transitions ?? []
        setUnmatchedTransitions(transitions.filter((t) => !t.matchedFlow).length)
      })
      .catch(() => setUnmatchedTransitions(null))

    const csP = fetch(withDummyParam('/api/cs/tickets', includeDummy))
      .then((r) => r.json())
      .then((data) => {
        const tickets: CSTicket[] = data.tickets ?? []
        setOpenTicketCount(tickets.filter((t) => t.status === 'open').length)
      })
      .catch(() => setOpenTicketCount(null))

    await Promise.allSettled([lateP, productsP, deliverabilityP, rfmP, journeyP, csP])
    setLoading(false)
  }

  useEffect(() => { load() }, [includeDummy])

  const lateCount = lateShipments.length
  const lateValue = useMemo(
    () => lateShipments.reduce((s, ship) => s + (parseFloat(ship.totalPrice) || 0), 0),
    [lateShipments]
  )
  const stalledSummary = useMemo(() => getStalledUnitsSummary(products), [products])
  const soldOutCount = useMemo(() => products.filter(isSoldOutLive).length, [products])
  const lowRunwaySummary = useMemo(() => getLowRunwaySummary(products), [products])
  const returnRiskSummary = useMemo(() => getReturnRiskSummary(products), [products])

  const entries = useMemo(() => {
    const list: FeedEntry[] = []

    if (!lateUnavailable && lateCount > 0) {
      list.push({
        key: 'late-shipments',
        icon: Truck,
        tone: 'danger',
        text: `${lateCount} order${lateCount !== 1 ? 's' : ''} need attention`,
        detail: 'Late Shipments',
        valueLabel: `${fmt(lateValue, currency)} at risk`,
        monetaryValue: lateValue,
        countValue: lateCount,
        onClick: onGoToLateShipments,
      })
    }

    if (!productsUnavailable && stalledSummary.units > 0) {
      list.push({
        key: 'stalled-inventory',
        icon: Clock,
        tone: 'warning',
        text: `${stalledSummary.units.toLocaleString()} units stalled`,
        detail: 'Stalled Inventory',
        valueLabel: `${fmt(stalledSummary.potentialRevenue, currency)} potential revenue`,
        monetaryValue: stalledSummary.potentialRevenue,
        countValue: stalledSummary.units,
        onClick: () => onGoToProductsFiltered?.('stalled'),
      })
    }

    if (!productsUnavailable && lowRunwaySummary.count > 0) {
      list.push({
        key: 'low-runway',
        icon: AlertTriangle,
        tone: 'danger',
        text: `${lowRunwaySummary.count} product${lowRunwaySummary.count !== 1 ? 's' : ''} at risk of stockout`,
        detail: 'Predictive Stockout',
        valueLabel: `${fmt(lowRunwaySummary.revenueAtRisk, currency)} at risk`,
        monetaryValue: lowRunwaySummary.revenueAtRisk,
        countValue: lowRunwaySummary.count,
        onClick: () => onGoToProductsFiltered?.('lowrunway'),
      })
    }

    if (!productsUnavailable && returnsAvailable && returnRiskSummary.count > 0) {
      list.push({
        key: 'product-health',
        icon: AlertTriangle,
        tone: 'warning',
        text: `${returnRiskSummary.count} product${returnRiskSummary.count !== 1 ? 's' : ''} with high return rates`,
        detail: 'Product Health',
        valueLabel: `${fmt(returnRiskSummary.returnedRevenue, currency)} returned`,
        monetaryValue: returnRiskSummary.returnedRevenue,
        countValue: returnRiskSummary.count,
        onClick: () => onGoToProductsFiltered?.('returnrisk'),
      })
    }

    if (!productsUnavailable && soldOutCount > 0) {
      list.push({
        key: 'sold-out-live',
        icon: AlertCircle,
        tone: 'warning',
        text: `${soldOutCount} sold-out product${soldOutCount !== 1 ? 's' : ''} still live`,
        detail: 'Products & Inventory',
        valueLabel: `${soldOutCount.toLocaleString()} products`,
        monetaryValue: null,
        countValue: soldOutCount,
        onClick: () => onGoToProductsFiltered?.('soldout'),
      })
    }

    if (deliverabilityFlag) {
      list.push({
        key: 'deliverability',
        icon: Mail,
        tone: 'warning',
        text: 'Bounce, complaint, and unsubscribe rates all drifted the wrong direction',
        detail: 'Email Performance · Deliverability',
        valueLabel: '3 metrics worsening',
        monetaryValue: null,
        countValue: 3,
        onClick: onGoToEmailDeliverability,
      })
    }

    if (atRiskCount != null && atRiskCount > 0) {
      list.push({
        key: 'rfm-at-risk',
        icon: UserMinus,
        tone: 'warning',
        text: 'Used to buy often — gone quiet recently',
        detail: 'Customer Intelligence · At Risk segment',
        valueLabel: `${atRiskCount.toLocaleString()} customers`,
        monetaryValue: null,
        countValue: atRiskCount,
        onClick: onGoToCustomerIntelligenceRFM,
      })
    }

    if (unmatchedTransitions != null && unmatchedTransitions > 0) {
      list.push({
        key: 'unmatched-transitions',
        icon: GitBranch,
        tone: 'warning',
        text: 'Real stage transitions not matched to an active flow',
        detail: 'Customer Intelligence · Journey',
        valueLabel: `${unmatchedTransitions.toLocaleString()} transitions`,
        monetaryValue: null,
        countValue: unmatchedTransitions,
        onClick: onGoToCustomerJourney,
      })
    }

    if (openTicketCount != null && openTicketCount > 0) {
      list.push({
        key: 'open-tickets',
        icon: Inbox,
        tone: 'danger',
        text: `${openTicketCount} open ticket${openTicketCount !== 1 ? 's' : ''}`,
        detail: 'Customer Service',
        valueLabel: `${openTicketCount.toLocaleString()} tickets`,
        monetaryValue: null,
        countValue: openTicketCount,
        onClick: onGoToCustomerService,
      })
    }

    return list.sort((a, b) => {
      const aMoney = a.monetaryValue != null
      const bMoney = b.monetaryValue != null
      if (aMoney && bMoney) return b.monetaryValue! - a.monetaryValue!
      if (aMoney !== bMoney) return aMoney ? -1 : 1
      return b.countValue - a.countValue
    })
  }, [
    lateUnavailable, lateCount, lateValue, currency, onGoToLateShipments,
    productsUnavailable, stalledSummary, soldOutCount, lowRunwaySummary, returnsAvailable, returnRiskSummary, onGoToProductsFiltered,
    deliverabilityFlag, onGoToEmailDeliverability,
    atRiskCount, onGoToCustomerIntelligenceRFM,
    unmatchedTransitions, onGoToCustomerJourney,
    openTicketCount, onGoToCustomerService,
  ])

  return (
    <section className="max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Attention Feed</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">
            The most urgent items across the dashboard, ranked by value at risk
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

      {loading && <LoadingSpinner label="Gathering alerts across the dashboard…" />}

      {!loading && entries.length === 0 && (
        <div className="flex items-center gap-3 p-5 bg-white rounded-2xl shadow-card text-sm text-charcoal-500">
          <CheckCircle2 size={18} className="text-olive-500 flex-shrink-0" />
          Nothing needs urgent attention right now.
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card divide-y divide-sand-200">
          {entries.map((entry, i) => {
            const Icon = entry.icon
            const toneColor = entry.tone === 'danger' ? 'text-red-600' : 'text-amber-600'
            return (
              <div key={entry.key} className="flex items-center gap-4 px-5 py-4">
                <span className="text-xs text-charcoal-300 w-4 flex-shrink-0 text-right">{i + 1}</span>
                <Icon size={16} className={`flex-shrink-0 ${toneColor}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-charcoal-700 truncate">{entry.text}</p>
                  {entry.detail && <p className="text-xs text-charcoal-400 mt-0.5">{entry.detail}</p>}
                </div>
                <p className="text-sm font-medium text-charcoal-700 flex-shrink-0">{entry.valueLabel}</p>
                {entry.onClick && (
                  <button
                    onClick={entry.onClick}
                    className="text-xs font-medium text-terracotta-500 hover:text-terracotta-600 transition-colors flex-shrink-0"
                  >
                    View →
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

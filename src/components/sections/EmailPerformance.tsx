'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import DemoDataBadge from '@/components/ui/DemoDataBadge'
import EmailFlows from '@/components/sections/EmailFlows'
import EmailCampaigns from '@/components/sections/EmailCampaigns'
import EmailDeliverability from '@/components/sections/EmailDeliverability'
import EmailEngagementRecency from '@/components/sections/EmailEngagementRecency'
import EmailStageAttribution from '@/components/sections/EmailStageAttribution'

type View = 'flows' | 'campaigns' | 'deliverability' | 'engagement' | 'attribution'

const VIEWS: { id: View; label: string }[] = [
  { id: 'flows', label: 'Flows' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'deliverability', label: 'Deliverability' },
  { id: 'engagement', label: 'Engagement Recency' },
  { id: 'attribution', label: 'Stage Attribution' },
]

// Local to this tab, separate from the app-wide "Include Dummy Data" toggle
// in the Sidebar — that one blends fabricated Shopify orders/customers into
// real data elsewhere; this one switches Campaigns/Deliverability between
// the hand-authored demo dataset and live Omnisend analytics. Flows,
// Engagement Recency, and the illustrative half of Stage Attribution have no
// live source yet (see src/lib/omnisend.ts's omnisendAnalyticsReport comment)
// so they stay on modeled data regardless of this toggle.
const STORAGE_KEY = 'lela_email_perf_real_data'

export default function EmailPerformance({
  initialView,
  onInitialViewHandled,
  onNavigateToJourney,
}: {
  initialView?: 'attribution' | 'deliverability' | null
  onInitialViewHandled?: () => void
  onNavigateToJourney?: () => void
}) {
  const [activeView, setActiveView] = useState<View>('flows')
  const [useRealData, setUseRealData] = useState(false)

  useEffect(() => {
    setUseRealData(window.localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  function toggleRealData() {
    const next = !useRealData
    setUseRealData(next)
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  }

  useEffect(() => {
    if (!initialView) return
    setActiveView(initialView)
    onInitialViewHandled?.()
  }, [initialView, onInitialViewHandled])

  return (
    <section className="max-w-5xl">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Email Performance</h2>
            {useRealData ? (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-olive-100 text-olive-600 border border-olive-200"
                title="Flows, Campaigns, and Deliverability use real Omnisend data. Flow-level numbers are per-workflow totals, not a per-email step breakdown. Engagement Recency and the illustrative half of Stage Attribution are still modeled — no live source available for those yet."
              >
                <CheckCircle2 size={12} /> Partially live
              </span>
            ) : (
              <DemoDataBadge />
            )}
          </div>
          <p className="text-sm text-charcoal-400 mt-1.5">
            Flows and campaigns, tracked separately — plus deliverability, engagement recency, and how they connect
            to the lifecycle stages in Customer Intelligence.
          </p>
        </div>

        <button
          onClick={toggleRealData}
          className="flex items-center gap-2 flex-shrink-0"
          aria-pressed={useRealData}
        >
          <span className="text-xs font-medium text-charcoal-500">
            {useRealData ? 'Real data' : 'Demo data'}
          </span>
          <span
            className={`relative inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors ${
              useRealData ? 'bg-terracotta-500' : 'bg-sand-300'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                useRealData ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>

      <div className="flex bg-sand-100 rounded-full p-1 gap-0.5 w-fit mb-6 flex-wrap">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setActiveView(v.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors ${
              activeView === v.id ? 'bg-white text-terracotta-600 shadow-card' : 'text-charcoal-400 hover:text-charcoal-700'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {activeView === 'flows' && <EmailFlows useRealData={useRealData} />}
      {activeView === 'campaigns' && <EmailCampaigns useRealData={useRealData} />}
      {activeView === 'deliverability' && <EmailDeliverability useRealData={useRealData} />}
      {activeView === 'engagement' && <EmailEngagementRecency />}
      {activeView === 'attribution' && <EmailStageAttribution onNavigateToJourney={onNavigateToJourney} />}
    </section>
  )
}

'use client'

import { useEffect, useMemo, useState, Fragment } from 'react'
import { RefreshCw, AlertCircle, ChevronRight, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Modal from '@/components/ui/Modal'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import {
  JOURNEY_STAGE_ORDER,
  JOURNEY_STAGE_META,
  JOURNEY_AUTOMATIONS,
  LEAD_SOURCE_BREAKDOWN,
  OMNISEND_AUTOMATIONS_URL,
  OMNISEND_CAMPAIGNS_URL,
  computeJourneyCounts,
  groupCustomersByStage,
  type JourneyStage,
  type JourneyAutomation,
} from '@/lib/journey'
import type { EnrichedCustomer } from '@/types'

interface CreateCampaignResult {
  tagged: number
  segment: { segmentID: string; name: string }
  alreadyExisted: boolean
}

function AutomationCard({
  automation,
  onCreate,
}: {
  automation: JourneyAutomation
  onCreate: (automation: JourneyAutomation) => void
}) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="font-medium text-sm text-charcoal-700">{automation.name}</p>
        <span
          className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
            automation.active
              ? 'bg-olive-100 text-olive-600 border border-olive-200'
              : 'bg-sand-100 text-charcoal-500 border border-sand-300'
          }`}
        >
          {automation.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <p className="text-xs text-charcoal-400 leading-relaxed mb-3">{automation.description}</p>
      {automation.active ? (
        <a
          href={OMNISEND_AUTOMATIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sand-300 text-charcoal-700 hover:bg-cream-100 text-xs font-medium transition-colors"
        >
          <ExternalLink size={12} /> View
        </a>
      ) : (
        <button
          onClick={() => onCreate(automation)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-terracotta-500 hover:bg-terracotta-600 text-white text-xs font-medium transition-colors"
        >
          Create
        </button>
      )}
    </div>
  )
}

function CreateAutomationModal({
  automation,
  audience,
  onClose,
}: {
  automation: JourneyAutomation
  audience: EnrichedCustomer[]
  onClose: () => void
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<CreateCampaignResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const consentedEmails = useMemo(
    () => audience.filter((c) => c.email_marketing_consent?.state === 'subscribed').map((c) => c.email),
    [audience]
  )

  async function submit() {
    setStatus('loading')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/customer-journey/create-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: automation.stage, customerEmails: consentedEmails }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setStatus('success')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to create segment')
      setStatus('error')
    }
  }

  return (
    <Modal open onClose={onClose} title={automation.name}>
      {status === 'success' && result ? (
        <div>
          <div className="flex items-start gap-2 text-sm text-olive-600 bg-olive-100 border border-olive-200 rounded-xl p-3 mb-4">
            <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
            <p>
              Segment <strong>{result.segment.name}</strong> {result.alreadyExisted ? 'already existed and is' : 'created,'} ready
              with <strong>{result.tagged}</strong> subscribed customer{result.tagged === 1 ? '' : 's'} from the {automation.stage}{' '}
              stage.
            </p>
          </div>
          <a
            href={OMNISEND_CAMPAIGNS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta-500 hover:bg-terracotta-600 text-white text-sm font-medium transition-colors"
          >
            <ExternalLink size={14} /> Open Omnisend to design campaign
          </a>
        </div>
      ) : (
        <div>
          <p className="text-sm text-charcoal-500 leading-relaxed mb-4">
            Creates (or reuses) an Omnisend segment for the <strong>{automation.stage}</strong> stage and tags every subscribed
            customer currently in it, so you can build this campaign in Omnisend.
          </p>
          <p className="text-sm text-charcoal-700 mb-4">
            <strong>{consentedEmails.length}</strong> of {audience.length} customers in this stage are subscribed to email
            marketing.
          </p>
          {errorMsg && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
              <AlertCircle size={14} /> {errorMsg}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={status === 'loading' || consentedEmails.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta-500 hover:bg-terracotta-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {status === 'loading' && <Loader2 size={14} className="animate-spin" />}
              {status === 'loading' ? 'Creating…' : 'Create segment'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-sand-300 text-charcoal-700 hover:bg-cream-100 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function CustomerJourney() {
  const [customers, setCustomers] = useState<EnrichedCustomer[]>([])
  const [contactCount, setContactCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAutomation, setActiveAutomation] = useState<JourneyAutomation | null>(null)
  const { includeDummy } = useDummyData()

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [customersRes, contactsRes] = await Promise.all([
        fetch(withDummyParam('/api/shopify/customers', includeDummy)),
        fetch('/api/omnisend/contacts-count'),
      ])
      const customersData = await customersRes.json()
      const contactsData = await contactsRes.json()
      if (!customersRes.ok) throw new Error(customersData.error)
      setCustomers(customersData.customers)
      // Contact count is best-effort — journey still renders on Shopify data alone if it fails.
      setContactCount(contactsRes.ok ? contactsData.total : 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [includeDummy]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => computeJourneyCounts(customers, contactCount), [customers, contactCount])

  // Which customers belong to each stage, for the "Create" flow's audience. Lead has
  // no order history to classify by, so it falls back to Shopify customer records
  // with zero orders — a real, taggable subset, though smaller than the headline
  // Lead count above (which also counts non-Shopify Omnisend contacts).
  const stageAudiences = useMemo(() => {
    const groups = groupCustomersByStage(customers)
    return { Lead: customers.filter((c) => c.orders_count === 0), ...groups } as Record<JourneyStage, EnrichedCustomer[]>
  }, [customers])

  return (
    <section className="max-w-none">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Customer Journey</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">Lifecycle stages and the automations that should fire at each one</p>
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

      {loading && <LoadingSpinner label="Mapping customer journey…" />}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto pb-4">
          <div className="flex items-start min-w-max">
            {JOURNEY_STAGE_ORDER.map((stage, i) => {
              const meta = JOURNEY_STAGE_META[stage]
              const automations = JOURNEY_AUTOMATIONS.filter((a) => a.stage === stage)
              return (
                <Fragment key={stage}>
                  <div className="w-[260px] flex-shrink-0">
                    <div className={`rounded-2xl border px-4 py-3 mb-3 ${meta.bg} ${meta.border}`}>
                      <p className={`font-serif text-lg tracking-tight ${meta.text}`}>{stage}</p>
                      <p className="text-xs text-charcoal-500 mt-0.5">{counts[stage].toLocaleString()} customers</p>
                      {stage === 'Lead' && (
                        <p className="text-[11px] text-charcoal-400 mt-2 leading-relaxed">
                          <span className="italic">Illustrative sources — </span>
                          {LEAD_SOURCE_BREAKDOWN.map((s) => `${s.source} ${s.pct}%`).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-3">
                      {automations.map((automation) => (
                        <AutomationCard key={automation.id} automation={automation} onCreate={setActiveAutomation} />
                      ))}
                    </div>
                  </div>
                  {i < JOURNEY_STAGE_ORDER.length - 1 && (
                    <div className="flex-shrink-0 w-8 flex items-center justify-center mt-10">
                      <ChevronRight size={18} className="text-sand-400" />
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
        </div>
      )}

      {activeAutomation && (
        <CreateAutomationModal
          automation={activeAutomation}
          audience={stageAudiences[activeAutomation.stage]}
          onClose={() => setActiveAutomation(null)}
        />
      )}
    </section>
  )
}

'use client'

import { useEffect, useMemo, useState, Fragment } from 'react'
import {
  ChevronRight, ArrowRight, ExternalLink, CheckCircle2, Loader2, AlertCircle, ZoomIn, ZoomOut,
  AlertTriangle, Info, Star, Mail, MessageSquare, RefreshCw,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import {
  JOURNEY_STAGE_ORDER,
  JOURNEY_STAGE_META,
  JOURNEY_AUTOMATIONS,
  LEAD_SOURCE_BREAKDOWN,
  STAGE_TRANSITION_RULES,
  OMNISEND_AUTOMATIONS_URL,
  OMNISEND_CAMPAIGNS_URL,
  omnisendAutomationEditUrl,
  JOURNEY_AUTOMATION_OMNISEND_NAMES,
  computeJourneyCounts,
  groupCustomersByStage,
  type JourneyStage,
  type JourneyAutomation,
} from '@/lib/journey'
import type { AutomationSummary } from '@/app/api/omnisend/automations/route'
import { LIFECYCLE_STAGE_META, type LifecycleStage } from '@/lib/segmentation'
import { ILLUSTRATIVE_ATTRIBUTION_EXAMPLES } from '@/lib/email-performance-demo'
import type { EnrichedCustomer } from '@/types'

interface RealTransition {
  customerId: number
  oldStage: LifecycleStage | null
  newStage: LifecycleStage
  changedAt: string
  matchedFlow: string | null
}

function StagePill({ stage }: { stage: LifecycleStage }) {
  const meta = LIFECYCLE_STAGE_META[stage]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.text} ${meta.border}`}>
      {stage}
    </span>
  )
}

// Compact companion to Email Performance's full Stage Attribution tab — same
// data source (/api/customer-stage-history), same real/illustrative split,
// condensed to a summary since the full detail lives one click away.
function StageAttributionCard({ onNavigateToEmailAttribution }: { onNavigateToEmailAttribution?: () => void }) {
  const [transitions, setTransitions] = useState<RealTransition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/customer-stage-history')
      .then((r) => r.json())
      .then((d) => setTransitions(d.transitions ?? []))
      .catch(() => setTransitions([]))
      .finally(() => setLoading(false))
  }, [])

  const example = ILLUSTRATIVE_ATTRIBUTION_EXAMPLES[0]

  return (
    <div className="bg-white rounded-2xl shadow-card px-5 py-4 mb-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400">Stage-to-Flow Attribution</p>
        {onNavigateToEmailAttribution && (
          <button
            onClick={onNavigateToEmailAttribution}
            className="inline-flex items-center gap-1 text-xs font-medium text-terracotta-600 hover:text-terracotta-700 transition-colors flex-shrink-0"
          >
            View full detail in Email Performance <ExternalLink size={11} />
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-charcoal-400">Loading…</p>
      ) : transitions.length > 0 ? (
        <p className="text-sm text-charcoal-700">
          <strong>{transitions.length}</strong> real stage transition{transitions.length === 1 ? '' : 's'} recorded ·{' '}
          <strong>{transitions.filter((t) => t.matchedFlow).length}</strong> matched to an active flow
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-charcoal-400 italic">Illustrative —</span>
          <StagePill stage={example.oldStage} />
          <ArrowRight size={12} className="text-charcoal-300" />
          <StagePill stage={example.newStage} />
          <span className="text-charcoal-500">via {example.matchedFlow}</span>
        </div>
      )}
    </div>
  )
}

// Stages with a 0-count diagnostic — surfaces likely mis-configured segment triggers
// rather than letting an empty column read as "nothing to see here".
const DIAGNOSTIC_STAGES: JourneyStage[] = ['At Risk', 'Lapsed']

// Pre-Purchase's two cards have genuinely different audiences within the same column
// (unlike every other stage, where one bucket serves all its cards), so audience
// resolution happens per-automation rather than a single stageAudiences[stage] lookup.
function audienceForAutomation(
  automation: JourneyAutomation,
  customers: EnrichedCustomer[],
  stageAudiences: Record<Exclude<JourneyStage, 'Pre-Purchase'>, EnrichedCustomer[]>
): EnrichedCustomer[] {
  if (automation.id === 'browse-abandonment') return [] // no session/pixel tracking in this app — honestly empty
  if (automation.id === 'cart-abandonment') return customers.filter((c) => c.abandonedCheckouts.length > 0)
  if (automation.stage === 'Pre-Purchase') return []
  return stageAudiences[automation.stage] ?? []
}

function normalizeAutomationName(name: string): string {
  return name.trim().toLowerCase()
}

function ChannelBadge({ channel }: { channel: JourneyAutomation['channel'] }) {
  const Icon = channel === 'SMS' ? MessageSquare : Mail
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-cream-200 text-charcoal-600">
      <Icon size={9} /> {channel}
    </span>
  )
}

interface CreateCampaignResult {
  tagged: number
  segment: { segmentID: string; name: string }
  alreadyExisted: boolean
}

function AutomationCard({
  automation,
  onCreate,
  realAutomationId,
}: {
  automation: JourneyAutomation
  onCreate: (automation: JourneyAutomation) => void
  realAutomationId?: string
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-card p-4 ${automation.priority ? 'border-2 border-terracotta-300' : ''}`}>
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
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {automation.priority && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-terracotta-100 text-terracotta-700">
            <Star size={9} fill="currentColor" /> Priority
          </span>
        )}
        <ChannelBadge channel={automation.channel} />
      </div>
      <p className="text-xs text-charcoal-400 leading-relaxed mb-3">{automation.description}</p>
      {automation.active && automation.performance && (
        <p
          className="text-[11px] text-charcoal-400 -mt-2 mb-3"
          title="Placeholder — Omnisend flow-performance API not yet wired up"
        >
          ≈ €{automation.performance.revenuePerRecipient.toFixed(2)} / recipient
        </p>
      )}
      {automation.active ? (
        <a
          href={realAutomationId ? omnisendAutomationEditUrl(realAutomationId) : OMNISEND_AUTOMATIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={realAutomationId ? undefined : "Exact automation not found in your Omnisend account yet — opens the automations list instead"}
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
          {automation.id === 'browse-abandonment' && (
            <div className="flex items-center gap-2 text-sm text-charcoal-500 bg-sand-100 border border-sand-300 rounded-xl p-3 mb-4">
              <AlertCircle size={14} className="flex-shrink-0" />
              Lela has no browse/session tracking source yet, so this audience is always empty until one's wired up.
            </div>
          )}
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

const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1

export default function CustomerJourney({
  customers,
  onNavigateToEmailAttribution,
}: {
  customers: EnrichedCustomer[]
  onNavigateToEmailAttribution?: () => void
}) {
  const [contactCount, setContactCount] = useState(0)
  const [contactsLoading, setContactsLoading] = useState(true)
  const [activeAutomation, setActiveAutomation] = useState<JourneyAutomation | null>(null)
  const [zoom, setZoom] = useState(1)
  const [expandedRules, setExpandedRules] = useState<Set<JourneyStage>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ checked: number; changed: number; errors: { customerId: number; email: string; error: string }[] } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [realAutomationIds, setRealAutomationIds] = useState<Map<string, string>>(new Map())

  async function syncStages() {
    setSyncing(true)
    setSyncError(null)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync-stages', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setSyncResult(data)
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  function zoomIn() { setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100)) }
  function zoomOut() { setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100)) }

  function toggleRule(stage: JourneyStage) {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      next.has(stage) ? next.delete(stage) : next.add(stage)
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    setContactsLoading(true)
    fetch('/api/omnisend/contacts-count')
      .then((res) => (res.ok ? res.json() : { total: 0 }))
      .then((data) => { if (!cancelled) setContactCount(data.total ?? 0) })
      .catch(() => { if (!cancelled) setContactCount(0) })
      .finally(() => { if (!cancelled) setContactsLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Best-effort: resolves each active automation card's "View" link to the real
  // Omnisend workflow by matching names, so cards self-upgrade from the generic
  // automations-list link as more of the real account's automations go live.
  // Silent on failure — this only improves a link, it shouldn't block the page.
  useEffect(() => {
    let cancelled = false
    fetch('/api/omnisend/automations')
      .then((res) => (res.ok ? res.json() : { automations: [] }))
      .then((data: { automations?: AutomationSummary[] }) => {
        if (cancelled) return
        const map = new Map<string, string>()
        for (const a of data.automations ?? []) {
          if (a.isEnabled) map.set(normalizeAutomationName(a.name), a.id)
        }
        setRealAutomationIds(map)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const counts = useMemo(() => computeJourneyCounts(customers, contactCount), [customers, contactCount])

  // JourneyAutomation.id -> real Omnisend automation id, for automations with a
  // declared correspondence (JOURNEY_AUTOMATION_OMNISEND_NAMES) whose real
  // workflow was actually found in the account.
  const resolvedAutomationIds = useMemo(() => {
    const map = new Map<string, string>()
    for (const automation of JOURNEY_AUTOMATIONS) {
      const realName = JOURNEY_AUTOMATION_OMNISEND_NAMES[automation.id]
      const realId = realName ? realAutomationIds.get(normalizeAutomationName(realName)) : undefined
      if (realId) map.set(automation.id, realId)
    }
    return map
  }, [realAutomationIds])

  // Which customers belong to each stage, for the "Create" flow's audience. Lead has
  // no order history to classify by, so it falls back to Shopify customer records
  // with zero orders — a real, taggable subset, though smaller than the headline
  // Lead count above (which also counts non-Shopify Omnisend contacts).
  const stageAudiences = useMemo(() => {
    const groups = groupCustomersByStage(customers)
    return { Lead: customers.filter((c) => c.orders_count === 0), ...groups }
  }, [customers])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <button
          onClick={syncStages}
          disabled={syncing}
          className="flex items-center gap-2 text-sm font-medium text-white bg-olive-500 hover:bg-olive-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {syncing ? 'Syncing…' : 'Sync Stages to Omnisend'}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom out"
            className="p-1.5 rounded-lg border border-sand-300 text-charcoal-500 hover:bg-cream-100 hover:text-terracotta-600 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => setZoom(1)}
            title="Reset zoom"
            className="w-12 text-center text-xs text-charcoal-400 hover:text-terracotta-500 transition-colors"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom in"
            className="p-1.5 rounded-lg border border-sand-300 text-charcoal-500 hover:bg-cream-100 hover:text-terracotta-600 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      {syncError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-3">
          <AlertCircle size={14} className="flex-shrink-0" /> {syncError}
        </div>
      )}

      {syncResult && (
        <div className="text-sm bg-white rounded-xl shadow-card px-4 py-3 mb-3">
          <p className="text-charcoal-700">
            Checked <strong>{syncResult.checked}</strong> customers · <strong>{syncResult.changed}</strong> stage
            change{syncResult.changed === 1 ? '' : 's'} synced to Omnisend
            {syncResult.errors.length > 0 && <> · <strong className="text-red-600">{syncResult.errors.length}</strong> error{syncResult.errors.length === 1 ? '' : 's'}</>}
          </p>
          {syncResult.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-red-600">
              {syncResult.errors.map((e) => (
                <li key={e.customerId}>{e.email || `Customer ${e.customerId}`}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <StageAttributionCard onNavigateToEmailAttribution={onNavigateToEmailAttribution} />

      <div className="overflow-x-auto pb-4">
        <div className="flex items-start min-w-max" style={{ zoom }}>
          {JOURNEY_STAGE_ORDER.map((stage, i) => {
            const meta = JOURNEY_STAGE_META[stage]
            const automations = JOURNEY_AUTOMATIONS.filter((a) => a.stage === stage)
            return (
              <Fragment key={stage}>
                <div className="w-[260px] flex-shrink-0">
                  <div className={`rounded-2xl border px-4 py-3 mb-3 ${meta.bg} ${meta.border}`}>
                    <div className="flex items-center justify-between gap-1">
                      <p className={`font-serif text-lg tracking-tight ${meta.text}`}>{stage}</p>
                      <button
                        onClick={() => toggleRule(stage)}
                        title="Show transition rule"
                        className={`flex-shrink-0 p-0.5 rounded transition-colors ${meta.text} opacity-60 hover:opacity-100`}
                      >
                        <Info size={13} />
                      </button>
                    </div>
                    <p className="text-xs text-charcoal-500 mt-0.5 flex items-center gap-1">
                      {stage === 'Lead' && contactsLoading
                        ? '…'
                        : stage === 'Pre-Purchase'
                        ? `${counts[stage].toLocaleString()} with an abandoned cart`
                        : `${counts[stage].toLocaleString()} customers`}
                      {DIAGNOSTIC_STAGES.includes(stage) && counts[stage] === 0 && (
                        <span title="0 customers — check segment trigger definitions" className="flex-shrink-0">
                          <AlertTriangle size={11} className="text-amber-600" />
                        </span>
                      )}
                    </p>
                    {expandedRules.has(stage) && (
                      <p className="text-[11px] text-charcoal-400 mt-2 leading-relaxed">
                        {STAGE_TRANSITION_RULES[stage]}
                      </p>
                    )}
                    {stage === 'Lead' && (
                      <p className="text-[11px] text-charcoal-400 mt-2 leading-relaxed">
                        <span className="italic">Illustrative sources — </span>
                        {LEAD_SOURCE_BREAKDOWN.map((s) => `${s.source} ${s.pct}%`).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    {automations.map((automation) => (
                      <AutomationCard
                        key={automation.id}
                        automation={automation}
                        onCreate={setActiveAutomation}
                        realAutomationId={resolvedAutomationIds.get(automation.id)}
                      />
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

      {activeAutomation && (
        <CreateAutomationModal
          automation={activeAutomation}
          audience={audienceForAutomation(activeAutomation, customers, stageAudiences)}
          onClose={() => setActiveAutomation(null)}
        />
      )}
    </div>
  )
}

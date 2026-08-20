'use client'

import { useEffect, useMemo, useState, Fragment } from 'react'
import {
  ChevronRight, ArrowRight, ExternalLink, CheckCircle2, Loader2, AlertCircle, ZoomIn, ZoomOut,
  AlertTriangle, Info, Star, Mail, MessageSquare, RefreshCw,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import CollapsibleCard from '@/components/ui/CollapsibleCard'
import MaskedEmail, { HideAllEmailsButton } from '@/components/ui/MaskedEmail'
import {
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
  neverPurchasedLeadCustomers,
  type JourneyStage,
  type JourneyAutomation,
} from '@/lib/journey'
import type { AutomationSummary } from '@/app/api/omnisend/automations/route'
import { LIFECYCLE_STAGE_META, WINBACK_START_DAYS, type LifecycleStage } from '@/lib/segmentation'
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

function fmtSyncDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
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

// The real, known-customer subset of Lead — never-purchased Shopify customers
// (see neverPurchasedLeadCustomers in journey.ts). Lets you actually see who's
// behind the Lead count, since that headline number can include an Omnisend-only
// approximation on top of this real list.
function LeadListModal({ customers, onClose }: { customers: EnrichedCustomer[]; onClose: () => void }) {
  const [hiddenEmailIds, setHiddenEmailIds] = useState<Set<number>>(new Set())

  function toggleEmailVisibility(id: number) {
    setHiddenEmailIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allHidden = customers.length > 0 && customers.every((c) => hiddenEmailIds.has(c.id))

  return (
    <Modal open onClose={onClose} title="Lead — Never Purchased">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-charcoal-500">
          <strong>{customers.length}</strong> customer{customers.length === 1 ? '' : 's'} registered but never purchased
        </p>
        <HideAllEmailsButton
          allHidden={allHidden}
          onClick={() => setHiddenEmailIds(allHidden ? new Set() : new Set(customers.map((c) => c.id)))}
        />
      </div>
      <div className="max-h-96 overflow-y-auto -mx-6 px-6">
        <ul className="divide-y divide-sand-100">
          {customers.map((c) => (
            <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm text-charcoal-700 font-medium truncate">{c.first_name} {c.last_name}</span>
              <span className="text-xs text-charcoal-400 shrink-0">
                <MaskedEmail email={c.email} hidden={hiddenEmailIds.has(c.id)} onToggle={() => toggleEmailVisibility(c.id)} />
              </span>
            </li>
          ))}
          {customers.length === 0 && (
            <li className="py-8 text-center text-sm text-charcoal-400">No customers in this list yet.</li>
          )}
        </ul>
      </div>
    </Modal>
  )
}

// Fixed column/gap widths shared by every row and the connector band below, so
// the growth spine (5 columns) and decay spine (4 columns, right-aligned under
// New–VIP via a matching leading spacer) stay pixel-aligned without measuring
// live DOM positions.
const STAGE_COLUMN_WIDTH = 260
const STAGE_GAP_WIDTH = 32

// Growth spine (unchanged left-to-right progression by order count) and decay
// spine (recency-driven, order-count-independent) — together these are
// JOURNEY_STAGE_ORDER minus 'Pre-Purchase', which renders as a note below both
// rows instead of a column (see the Pre-Purchase CollapsibleCard further down).
const GROWTH_SPINE: JourneyStage[] = ['Lead', 'New', 'Active', 'Loyal', 'VIP']
const DECAY_SPINE: JourneyStage[] = ['Winback', 'At Risk', 'Lapsed', 'Lost']

// Horizontal center (px, from the row's left edge) of each of `count` equal-width
// columns laid out left-to-right with the given width/gap — used to drop a
// connector line precisely under a specific stage card without measuring the
// live DOM. GROWTH_SPINE's own first column (Lead) is excluded by callers that
// only care about the four order-count stages (New/Active/Loyal/VIP).
function spineColumnCenters(count: number, columnWidth: number, gapWidth: number): number[] {
  const step = columnWidth + gapWidth
  return Array.from({ length: count }, (_, i) => i * step + columnWidth / 2)
}

function StageColumn({
  stage,
  count,
  contactsLoading,
  onShowLeadList,
  expanded,
  onToggleRule,
  automations,
  onCreateAutomation,
  resolvedAutomationIds,
}: {
  stage: JourneyStage
  count: number
  contactsLoading: boolean
  onShowLeadList: () => void
  expanded: boolean
  onToggleRule: () => void
  automations: JourneyAutomation[]
  onCreateAutomation: (automation: JourneyAutomation) => void
  resolvedAutomationIds: Map<string, string>
}) {
  const meta = JOURNEY_STAGE_META[stage]
  return (
    <div style={{ width: STAGE_COLUMN_WIDTH }} className="flex-shrink-0">
      <div className={`rounded-2xl border px-4 py-3 mb-3 ${meta.bg} ${meta.border}`}>
        <div className="flex items-center justify-between gap-1">
          <p className={`font-serif text-lg tracking-tight ${meta.text}`}>{stage}</p>
          <button
            onClick={onToggleRule}
            title="Show transition rule"
            className={`flex-shrink-0 p-0.5 rounded transition-colors ${meta.text} opacity-60 hover:opacity-100`}
          >
            <Info size={13} />
          </button>
        </div>
        <p className="text-xs text-charcoal-500 mt-0.5 flex items-center gap-1">
          {stage === 'Lead' && contactsLoading ? (
            '…'
          ) : stage === 'Lead' ? (
            <button
              onClick={onShowLeadList}
              className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-terracotta-600 transition-colors"
            >
              {count.toLocaleString()} customers · view list
            </button>
          ) : (
            `${count.toLocaleString()} customers`
          )}
          {DIAGNOSTIC_STAGES.includes(stage) && count === 0 && (
            <span title="0 customers — check segment trigger definitions" className="flex-shrink-0">
              <AlertTriangle size={11} className="text-amber-600" />
            </span>
          )}
        </p>
        {expanded && (
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
        {stage === 'Winback' && (
          <p className="text-[11px] text-charcoal-400 mt-2 leading-relaxed italic">
            Entered from New, Active, Loyal, or VIP after {WINBACK_START_DAYS}+ days without an order. Converts
            → returns to whichever of those fits their refreshed order count and recency.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {automations.map((automation) => (
          <AutomationCard
            key={automation.id}
            automation={automation}
            onCreate={onCreateAutomation}
            realAutomationId={resolvedAutomationIds.get(automation.id)}
          />
        ))}
      </div>
    </div>
  )
}

// One row of the branching diagram — used for both the growth spine and the
// decay spine. `leadingSpacer` reserves one column+gap of empty space so the
// decay spine (4 columns) lines up under the New–VIP span of the growth spine
// (also 4 columns), with Winback landing directly under the connector band's
// arrow instead of under Lead.
function StageRow({
  stages,
  leadingSpacer,
  counts,
  contactsLoading,
  onShowLeadList,
  expandedRules,
  onToggleRule,
  onCreateAutomation,
  resolvedAutomationIds,
}: {
  stages: JourneyStage[]
  leadingSpacer?: boolean
  counts: Record<JourneyStage, number>
  contactsLoading: boolean
  onShowLeadList: () => void
  expandedRules: Set<JourneyStage>
  onToggleRule: (stage: JourneyStage) => void
  onCreateAutomation: (automation: JourneyAutomation) => void
  resolvedAutomationIds: Map<string, string>
}) {
  return (
    <div className="flex items-start">
      {leadingSpacer && (
        <>
          <div style={{ width: STAGE_COLUMN_WIDTH }} className="flex-shrink-0" />
          <div style={{ width: STAGE_GAP_WIDTH }} className="flex-shrink-0" />
        </>
      )}
      {stages.map((stage, i) => (
        <Fragment key={stage}>
          <StageColumn
            stage={stage}
            count={counts[stage]}
            contactsLoading={contactsLoading}
            onShowLeadList={onShowLeadList}
            expanded={expandedRules.has(stage)}
            onToggleRule={() => onToggleRule(stage)}
            automations={JOURNEY_AUTOMATIONS.filter((a) => a.stage === stage)}
            onCreateAutomation={onCreateAutomation}
            resolvedAutomationIds={resolvedAutomationIds}
          />
          {i < stages.length - 1 && (
            <div style={{ width: STAGE_GAP_WIDTH }} className="flex-shrink-0 flex items-center justify-center mt-10">
              <ChevronRight size={18} className="text-sand-400" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}

// Connects the growth spine to the decay spine: New/Active/Loyal/VIP can all
// decay into Winback once a customer's gone WINBACK_START_DAYS+ without an
// order. Drawn as a "rake" — one dashed stem dropping from each of those four
// stage cards, merging into a single shared line, then one trunk down into
// Winback — so it reads as "any of these four", not just a flat pipe between
// rows. (Not drawn the other direction, Winback back up to one fixed stage,
// since a converting Winback customer doesn't return to a single stage — see
// the note on Winback's own card instead.)
function DecayConnector() {
  const centers = spineColumnCenters(GROWTH_SPINE.length, STAGE_COLUMN_WIDTH, STAGE_GAP_WIDTH).slice(1)
  const spanLeft = centers[0]
  const spanWidth = centers[centers.length - 1] - centers[0]
  const trunkX = centers[0] // coincides with Winback's own center below, via the matching leadingSpacer on the decay row
  const tickHeight = 18
  const trunkHeight = 22

  return (
    <div>
      <p
        className="text-[11px] font-medium text-orange-600 text-center leading-snug"
        style={{ marginLeft: spanLeft, width: spanWidth }}
      >
        Any of New, Active, Loyal, or VIP — {WINBACK_START_DAYS}+ days without a new order
      </p>
      <div className="relative" style={{ height: tickHeight + trunkHeight }}>
        {centers.map((x) => (
          <div key={x} className="absolute border-l-2 border-dashed border-orange-300" style={{ left: x, top: 0, height: tickHeight }} />
        ))}
        <div className="absolute border-t-2 border-dashed border-orange-300" style={{ left: spanLeft, width: spanWidth, top: tickHeight }} />
        <div className="absolute border-l-2 border-dashed border-orange-300" style={{ left: trunkX, top: tickHeight, height: trunkHeight }} />
        <ChevronRight
          size={14}
          className="absolute rotate-90 text-orange-400"
          style={{ left: trunkX - 7, top: tickHeight + trunkHeight - 13 }}
        />
      </div>
    </div>
  )
}

// ─── Compact overview ───────────────────────────────────────────────────────
// A small, non-interactive stage-flow diagram rendered above the detailed map
// (which carries the full-size cards + automation stacks and can get dense
// enough that the branching shape at Winback is hard to take in at a glance).
// Mirrors the detailed map's two-spine shape at a much smaller size — same
// GROWTH_SPINE/DECAY_SPINE order, same JOURNEY_STAGE_META colors — so the two
// read as the same journey, just zoomed out.
const MINI_PILL_WIDTH = 110
const MINI_GAP_WIDTH = 16

function MiniStagePill({ stage, count }: { stage: JourneyStage; count: number }) {
  const meta = JOURNEY_STAGE_META[stage]
  return (
    <div
      style={{ width: MINI_PILL_WIDTH }}
      className={`flex-shrink-0 rounded-xl border px-3 py-2 ${meta.bg} ${meta.border}`}
    >
      <p className={`text-xs font-medium truncate ${meta.text}`}>{stage}</p>
      <p className="text-[10px] text-charcoal-400">{count.toLocaleString()}</p>
    </div>
  )
}

function MiniStageRow({
  stages,
  leadingSpacer,
  counts,
}: {
  stages: JourneyStage[]
  leadingSpacer?: boolean
  counts: Record<JourneyStage, number>
}) {
  return (
    <div className="flex items-center">
      {leadingSpacer && <div style={{ width: MINI_PILL_WIDTH + MINI_GAP_WIDTH }} className="flex-shrink-0" />}
      {stages.map((stage, i) => (
        <Fragment key={stage}>
          <MiniStagePill stage={stage} count={counts[stage]} />
          {i < stages.length - 1 && (
            <div style={{ width: MINI_GAP_WIDTH }} className="flex-shrink-0 flex items-center justify-center">
              <ChevronRight size={12} className="text-sand-400" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}

// Same "rake" shape as DecayConnector, scaled to the mini pills — see that
// component's comment for why it's drawn as four merging stems, not one line.
function MiniDecayConnector() {
  const centers = spineColumnCenters(GROWTH_SPINE.length, MINI_PILL_WIDTH, MINI_GAP_WIDTH).slice(1)
  const spanLeft = centers[0]
  const spanWidth = centers[centers.length - 1] - centers[0]
  const trunkX = centers[0]
  const tickHeight = 10
  const trunkHeight = 14

  return (
    <div>
      <p
        className="text-[10px] font-medium text-orange-600 text-center leading-snug"
        style={{ marginLeft: spanLeft, width: spanWidth }}
      >
        Any of these four — {WINBACK_START_DAYS}+ days without a new order
      </p>
      <div className="relative" style={{ height: tickHeight + trunkHeight }}>
        {centers.map((x) => (
          <div key={x} className="absolute border-l border-dashed border-orange-300" style={{ left: x, top: 0, height: tickHeight }} />
        ))}
        <div className="absolute border-t border-dashed border-orange-300" style={{ left: spanLeft, width: spanWidth, top: tickHeight }} />
        <div className="absolute border-l border-dashed border-orange-300" style={{ left: trunkX, top: tickHeight, height: trunkHeight }} />
        <ChevronRight
          size={10}
          className="absolute rotate-90 text-orange-400"
          style={{ left: trunkX - 5, top: tickHeight + trunkHeight - 9 }}
        />
      </div>
    </div>
  )
}

function JourneyOverview({ counts }: { counts: Record<JourneyStage, number> }) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-5 mb-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">Journey Overview</p>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <MiniStageRow stages={GROWTH_SPINE} counts={counts} />
          <MiniDecayConnector />
          <MiniStageRow stages={DECAY_SPINE} leadingSpacer counts={counts} />
        </div>
      </div>
      <p className="text-[11px] text-charcoal-400 mt-3">
        Pre-Purchase flows (cart/browse abandonment) can trigger at any point in this journey — see the card below.
      </p>
    </div>
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
  const [showLeadList, setShowLeadList] = useState(false)
  const [prePurchaseOpen, setPrePurchaseOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [expandedRules, setExpandedRules] = useState<Set<JourneyStage>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ checked: number; changed: number; errors: { customerId: number; email: string; error: string }[] } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [tagSyncing, setTagSyncing] = useState(false)
  const [tagSyncResult, setTagSyncResult] = useState<{ checked: number; changed: number; errors: { customerId: number; email: string; error: string }[] } | null>(null)
  const [tagSyncError, setTagSyncError] = useState<string | null>(null)
  const [lastTagSyncAt, setLastTagSyncAt] = useState<string | null>(null)
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

  // Separate from syncStages() above — pushes the namespaced stage:*/rfm:*/rfm-at-lapse:*
  // tags used for Omnisend automation branching (src/app/api/sync-tags/route.ts),
  // additive to the un-namespaced lela-* tags syncStages() already pushes.
  async function syncTags() {
    setTagSyncing(true)
    setTagSyncError(null)
    setTagSyncResult(null)
    try {
      const res = await fetch('/api/sync-tags', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setTagSyncResult(data)
      if (data.lastSyncAt) setLastTagSyncAt(data.lastSyncAt)
    } catch (e) {
      setTagSyncError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setTagSyncing(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/sync-tags')
      .then((res) => (res.ok ? res.json() : { lastSyncAt: null }))
      .then((data: { lastSyncAt: string | null }) => { if (!cancelled) setLastTagSyncAt(data.lastSyncAt) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

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

  // Which customers belong to each stage, for the "Create" flow's audience. Lead
  // uses the same real known-customer floor as the headline Lead count above
  // (see neverPurchasedLeadCustomers in journey.ts) — still smaller than that
  // count whenever the Omnisend-diff approximation is larger, since this audience
  // only contains real Shopify customer records.
  const stageAudiences = useMemo(() => {
    const groups = groupCustomersByStage(customers)
    return { Lead: neverPurchasedLeadCustomers(customers), ...groups }
  }, [customers])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={syncStages}
            disabled={syncing}
            className="flex items-center gap-2 text-sm font-medium text-white bg-olive-500 hover:bg-olive-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Syncing…' : 'Sync Stages to Omnisend'}
          </button>

          <button
            onClick={syncTags}
            disabled={tagSyncing}
            title="Pushes namespaced stage:*/rfm:*/rfm-at-lapse:* tags, for Omnisend automation branching"
            className="flex items-center gap-2 text-sm font-medium text-terracotta-700 bg-terracotta-100 hover:bg-terracotta-200 px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {tagSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {tagSyncing ? 'Syncing…' : 'Sync Tags (RFM/Source)'}
          </button>

          <span className="text-xs text-charcoal-400">
            {lastTagSyncAt ? `Last synced ${fmtSyncDate(lastTagSyncAt)}` : 'Never synced'}
          </span>
        </div>

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

      {tagSyncError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-3">
          <AlertCircle size={14} className="flex-shrink-0" /> {tagSyncError}
        </div>
      )}

      {tagSyncResult && (
        <div className="text-sm bg-white rounded-xl shadow-card px-4 py-3 mb-3">
          <p className="text-charcoal-700">
            Checked <strong>{tagSyncResult.checked}</strong> customers · <strong>{tagSyncResult.changed}</strong> tag
            change{tagSyncResult.changed === 1 ? '' : 's'} synced to Shopify + Omnisend
            {tagSyncResult.errors.length > 0 && <> · <strong className="text-red-600">{tagSyncResult.errors.length}</strong> error{tagSyncResult.errors.length === 1 ? '' : 's'}</>}
          </p>
          {tagSyncResult.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-red-600">
              {tagSyncResult.errors.map((e) => (
                <li key={e.customerId}>{e.email || `Customer ${e.customerId}`}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <StageAttributionCard onNavigateToEmailAttribution={onNavigateToEmailAttribution} />

      <JourneyOverview counts={counts} />

      <div className="overflow-x-auto pb-4">
        <div className="min-w-max" style={{ zoom }}>
          <StageRow
            stages={GROWTH_SPINE}
            counts={counts}
            contactsLoading={contactsLoading}
            onShowLeadList={() => setShowLeadList(true)}
            expandedRules={expandedRules}
            onToggleRule={toggleRule}
            onCreateAutomation={setActiveAutomation}
            resolvedAutomationIds={resolvedAutomationIds}
          />
          <DecayConnector />
          <StageRow
            stages={DECAY_SPINE}
            leadingSpacer
            counts={counts}
            contactsLoading={contactsLoading}
            onShowLeadList={() => setShowLeadList(true)}
            expandedRules={expandedRules}
            onToggleRule={toggleRule}
            onCreateAutomation={setActiveAutomation}
            resolvedAutomationIds={resolvedAutomationIds}
          />
        </div>
      </div>

      <div className="mt-3">
        <CollapsibleCard
          label="Pre-Purchase Flows"
          count={counts['Pre-Purchase']}
          isOpen={prePurchaseOpen}
          onToggle={() => setPrePurchaseOpen((v) => !v)}
        >
          <p className="text-sm text-charcoal-500 mb-4 leading-relaxed">{STAGE_TRANSITION_RULES['Pre-Purchase']}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {JOURNEY_AUTOMATIONS.filter((a) => a.stage === 'Pre-Purchase').map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onCreate={setActiveAutomation}
                realAutomationId={resolvedAutomationIds.get(automation.id)}
              />
            ))}
          </div>
        </CollapsibleCard>
      </div>

      {activeAutomation && (
        <CreateAutomationModal
          automation={activeAutomation}
          audience={audienceForAutomation(activeAutomation, customers, stageAudiences)}
          onClose={() => setActiveAutomation(null)}
        />
      )}

      {showLeadList && (
        <LeadListModal customers={stageAudiences.Lead} onClose={() => setShowLeadList(false)} />
      )}
    </div>
  )
}

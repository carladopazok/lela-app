'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  RefreshCw, AlertCircle, Mail, ArrowLeft, Send, Plus, Trash2,
  Edit2, Check, X, Loader2, Inbox, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Tag, User,
  ShieldAlert, Ban, ArrowUp, ArrowDown, ArrowUpDown, Sparkles, RotateCcw, Settings2, BookmarkPlus,
  Instagram, Search,
} from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MaskedEmail, { HideAllEmailsButton } from '@/components/ui/MaskedEmail'
import TagBadge from '@/components/ui/TagBadge'
import { useDummyData, withDummyParam } from '@/lib/dummy-data-context'
import { isLikelySpamSender } from '@/lib/spam-detection'
import type { CSTicket, CSMacro, TicketStatus, TicketTag, TicketChannel, EnrichedCustomer, AgentGuidanceNote } from '@/types'
import type { RetrievedSnippet } from '@/lib/pinecone'
import { TICKET_TAGS } from '@/types'

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_STYLES: Record<TicketStatus, string> = {
  open:              'bg-terracotta-100 text-terracotta-700 border border-terracotta-200',
  'needs attention': 'bg-amber-50 text-amber-700 border border-amber-200',
  archived:          'bg-sand-100 text-charcoal-500 border border-sand-300',
  resolved:          'bg-olive-100 text-olive-600 border border-olive-200',
  spam:              'bg-red-50 text-red-600 border border-red-200',
}

type TicketSortKey = 'from' | 'subject' | 'date' | 'status' | 'stage' | 'tags'
type SortDir = 'asc' | 'desc'

function SortableTh({
  label,
  sortKeyValue,
  activeKey,
  dir,
  onSort,
  widthClass,
}: {
  label: string
  sortKeyValue: TicketSortKey
  activeKey: TicketSortKey
  dir: SortDir
  onSort: (key: TicketSortKey) => void
  widthClass?: string
}) {
  const active = activeKey === sortKeyValue
  return (
    <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400 ${widthClass ?? ''}`}>
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

// ─── Ticket Detail ───────────────────────────────────────────────────────────

function TicketDetail({
  ticket: initial,
  macros,
  customTags,
  hiddenTags,
  onBack,
  onUpdated,
  onDeleted,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onTagCreated,
  onNavigateToCustomer,
  emailHidden,
  onToggleEmail,
  initialReplyBody,
  customerTag,
  customers,
}: {
  ticket: CSTicket
  macros: CSMacro[]
  customTags: string[]
  hiddenTags: string[]
  onBack: () => void
  onUpdated: (t: CSTicket) => void
  onDeleted: (id: string) => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
  onTagCreated: (tag: string) => void
  onNavigateToCustomer?: (email: string) => void
  emailHidden: boolean
  onToggleEmail: () => void
  initialReplyBody?: string
  customerTag?: string
  customers: EnrichedCustomer[]
}) {
  const [ticket, setTicket] = useState(initial)
  const [replyBody, setReplyBody] = useState(initialReplyBody ?? '')
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showMacros, setShowMacros] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingTag, setAddingTag] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')
  const [savingTag, setSavingTag] = useState(false)
  const [aiDrafting, setAiDrafting] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiSuggestedTag, setAiSuggestedTag] = useState<string | null>(null)
  const [aiHasDrafted, setAiHasDrafted] = useState(false)
  const [aiRetrievedContext, setAiRetrievedContext] = useState<RetrievedSnippet[]>([])
  const [showRetrievedContext, setShowRetrievedContext] = useState(false)
  const [aiGuidance, setAiGuidance] = useState('')
  const [savingGuidanceNote, setSavingGuidanceNote] = useState(false)
  const [savedGuidanceNote, setSavedGuidanceNote] = useState(false)

  async function sendReply(moveToStatus?: TicketStatus) {
    if (!replyBody.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/cs/tickets/${ticket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyBody, isNote: mode === 'note' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (moveToStatus) {
        const sr = await fetch(`/api/cs/tickets/${ticket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: moveToStatus }),
        })
        const sd = await sr.json()
        if (sr.ok) onUpdated(sd.ticket)
        onBack()
      } else {
        setTicket(data.ticket)
        onUpdated(data.ticket)
        setReplyBody('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  async function changeStatus(status: TicketStatus) {
    const res = await fetch(`/api/cs/tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    if (res.ok) { onUpdated(data.ticket); onBack() }
  }

  async function deleteTicket() {
    if (!confirm('Delete this ticket? This cannot be undone.')) return
    setDeleting(true)
    await fetch(`/api/cs/tickets/${ticket.id}`, { method: 'DELETE' })
    onDeleted(ticket.id)
  }

  async function toggleTag(tag: TicketTag) {
    const tags = ticket.tags.includes(tag)
      ? ticket.tags.filter((t) => t !== tag)
      : [...ticket.tags, tag]
    const res = await fetch(`/api/cs/tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    })
    const data = await res.json()
    if (res.ok) { setTicket(data.ticket); onUpdated(data.ticket) }
  }

  async function createTag() {
    const tag = newTagValue.trim().toLowerCase()
    if (!tag) return
    setSavingTag(true)
    await fetch('/api/cs/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tag }),
    })
    onTagCreated(tag)
    await toggleTag(tag)
    setNewTagValue('')
    setAddingTag(false)
    setSavingTag(false)
  }

  async function draftWithAI(guidance?: string) {
    setAiDrafting(true)
    setAiError(null)
    try {
      const customer = customers.find((c) => c.email?.toLowerCase() === ticket.from.toLowerCase())
      const res = await fetch(`/api/cs/tickets/${ticket.id}/ai-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customer
            ? {
                email: customer.email,
                orders_count: customer.orders_count,
                aov: customer.aov,
                lastOrderDate: customer.lastOrderDate,
                computedTags: customer.computedTags,
                manualTags: customer.manualTags,
              }
            : null,
          guidance,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReplyBody(data.draft)
      setAiSuggestedTag(data.tag ?? null)
      setAiHasDrafted(true)
      setAiRetrievedContext(data.retrievedContext ?? [])
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI draft failed')
    } finally {
      setAiDrafting(false)
    }
  }

  // Promotes this ticket's one-off guidance into a standing note on the Agent tab. The
  // guidance API has no partial-update endpoint (it's a small settings blob), so this
  // reads the current object and PUTs it back with the new note appended.
  async function saveGuidanceAsNote() {
    const text = aiGuidance.trim()
    if (!text) return
    const defaultTitle = text.length > 60 ? `${text.slice(0, 60)}…` : text
    const title = window.prompt('Title for this guidance note (shown on the Agent tab):', defaultTitle)
    if (!title?.trim()) return

    setSavingGuidanceNote(true)
    setAiError(null)
    setSavedGuidanceNote(false)
    try {
      const current = await fetch('/api/cs/agent-guidance').then((r) => r.json())
      const note = { id: crypto.randomUUID(), title: title.trim(), body: text, createdAt: new Date().toISOString() }
      const res = await fetch('/api/cs/agent-guidance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: current.agentName ?? '',
          toneOfVoice: current.toneOfVoice ?? '',
          standardMessage: current.standardMessage ?? '',
          notes: [...(current.notes ?? []), note],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSavedGuidanceNote(true)
      setTimeout(() => setSavedGuidanceNote(false), 2000)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to save guidance')
    } finally {
      setSavingGuidanceNote(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-charcoal-400 hover:text-charcoal-700 transition-colors">
            <ArrowLeft size={14} /> Back to tickets
          </button>
          <div className="flex items-center gap-1 border border-sand-300 rounded-lg overflow-hidden">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="px-2 py-1.5 text-charcoal-400 hover:text-charcoal-700 hover:bg-sand-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous ticket"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="w-px h-4 bg-sand-300" />
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="px-2 py-1.5 text-charcoal-400 hover:text-charcoal-700 hover:bg-sand-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next ticket"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLikelySpamSender(ticket.from) && ticket.status !== 'spam' && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
              <ShieldAlert size={12} /> Possible spam
            </span>
          )}
          <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[ticket.status]}`}>
            {ticket.status}
          </span>
          <button
            onClick={deleteTicket}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Delete
          </button>
        </div>
      </div>

      {/* Subject + customer */}
      <div className="bg-white rounded-2xl shadow-card p-6 mb-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-xl text-charcoal-700 mb-1">{ticket.subject}</h3>
          {ticket.channel === 'instagram' ? (
            <button
              disabled
              title="Not available for Instagram — no email on file"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-charcoal-300 bg-sand-100 border border-sand-200 rounded-lg cursor-not-allowed"
            >
              <User size={12} /> View customer profile
            </button>
          ) : onNavigateToCustomer && (
            <button
              onClick={() => onNavigateToCustomer(ticket.from)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-terracotta-600 hover:text-terracotta-700 bg-terracotta-50 hover:bg-terracotta-100 border border-terracotta-200 rounded-lg transition-colors"
            >
              <User size={12} /> View customer profile
            </button>
          )}
        </div>
        <p className="text-sm text-charcoal-400 flex items-center flex-wrap gap-1.5">
          <span>
            From <span className="text-charcoal-600 font-medium">{ticket.fromName}</span>
            {' '}·{' '}
            <MaskedEmail
              email={ticket.from}
              hidden={emailHidden}
              onToggle={onToggleEmail}
              mailto={ticket.channel !== 'instagram'}
              itemLabel={ticket.channel === 'instagram' ? 'contact info' : 'email'}
              className="text-terracotta-500"
            />
            {' '}·{' '}{fmtDate(ticket.receivedAt)}
          </span>
          {customerTag && <TagBadge tag={customerTag} />}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {[...(TICKET_TAGS as readonly string[]).filter(t => !hiddenTags.includes(t)), ...customTags].map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all capitalize
                ${ticket.tags.includes(tag)
                  ? 'bg-terracotta-500 text-white border-terracotta-500'
                  : 'bg-white text-charcoal-400 border-sand-300 hover:border-terracotta-300 hover:text-terracotta-600'
                }`}
            >
              {tag}
            </button>
          ))}
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
                className="px-2.5 py-0.5 text-xs border border-terracotta-300 rounded-full focus:outline-none focus:ring-1 focus:ring-terracotta-300 w-24"
              />
              <button
                onClick={createTag}
                disabled={savingTag || !newTagValue.trim()}
                className="p-0.5 text-terracotta-500 hover:text-terracotta-700 disabled:opacity-40"
              >
                {savingTag ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              </button>
              <button
                onClick={() => { setAddingTag(false); setNewTagValue('') }}
                className="p-0.5 text-charcoal-400 hover:text-charcoal-600"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingTag(true)}
              className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-dashed border-sand-400 text-charcoal-400 hover:border-terracotta-300 hover:text-terracotta-500 transition-all"
            >
              + New tag
            </button>
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="space-y-3 mb-4">
        {ticket.thread.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-2xl p-5 text-sm ${
              msg.direction === 'inbound'
                ? 'bg-white shadow-card border-l-2 border-sand-300'
                : msg.direction === 'note'
                ? 'bg-amber-50 border border-amber-200 border-dashed'
                : 'bg-olive-700 text-cream-100 ml-8'
            }`}
          >
            <p className={`text-xs mb-2 font-medium ${
              msg.direction === 'inbound' ? 'text-charcoal-400'
              : msg.direction === 'note' ? 'text-amber-600'
              : 'text-olive-200'
            }`}>
              {msg.direction === 'inbound' ? msg.from
                : msg.direction === 'note' ? 'Internal note · ' + fmtDate(msg.sentAt)
                : 'You'} {msg.direction !== 'note' && '· ' + fmtDate(msg.sentAt)}
            </p>
            <p className={`whitespace-pre-wrap leading-relaxed ${msg.direction === 'note' ? 'text-amber-900' : ''}`}>{msg.body}</p>
          </div>
        ))}
      </div>

      {/* Reply box */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-3">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {aiError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-3">
          <AlertCircle size={14} /> AI draft failed: {aiError}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 bg-sand-100 rounded-lg p-0.5">
            <button
              onClick={() => setMode('reply')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${mode === 'reply' ? 'bg-white text-charcoal-700 shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
            >
              Reply
            </button>
            <button
              onClick={() => setMode('note')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${mode === 'note' ? 'bg-amber-100 text-amber-700 shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
            >
              Internal note
            </button>
          </div>
          <div className="flex items-center gap-3">
            {ticket.status === 'open' && (
              <button
                onClick={() => draftWithAI()}
                disabled={aiDrafting}
                className="flex items-center gap-1 text-xs text-charcoal-400 hover:text-terracotta-500 transition-colors disabled:opacity-50"
              >
                {aiDrafting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {aiDrafting ? 'Drafting…' : 'Draft with AI'}
              </button>
            )}
            {macros.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowMacros((v) => !v)}
                  className="flex items-center gap-1 text-xs text-charcoal-400 hover:text-terracotta-500 transition-colors"
                >
                  <BookOpen size={12} /> Insert macro <ChevronDown size={12} />
                </button>
                {showMacros && (
                  <div className="absolute right-0 top-6 z-10 bg-white border border-sand-200 rounded-xl shadow-lg w-64 py-1 max-h-60 overflow-y-auto">
                    {macros.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setReplyBody(m.body); setShowMacros(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-charcoal-600 hover:bg-sand-50 hover:text-charcoal-800 transition-colors"
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {aiSuggestedTag && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-terracotta-50 border border-terracotta-200 rounded-lg">
            <Sparkles size={12} className="text-terracotta-500 shrink-0" />
            <span className="text-xs text-charcoal-600">
              Suggested tag: <span className="font-medium capitalize">{aiSuggestedTag}</span>
            </span>
            {!ticket.tags.includes(aiSuggestedTag) && (
              <button
                onClick={() => { toggleTag(aiSuggestedTag); setAiSuggestedTag(null) }}
                className="ml-auto text-xs font-medium text-terracotta-600 hover:text-terracotta-800"
              >
                Apply
              </button>
            )}
            <button onClick={() => setAiSuggestedTag(null)} className="text-charcoal-400 hover:text-charcoal-600">
              <X size={12} />
            </button>
          </div>
        )}
        {aiHasDrafted && (
          <div className="mb-3">
            <button
              onClick={() => setShowRetrievedContext((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-charcoal-400 hover:text-terracotta-500 transition-colors"
            >
              <Search size={12} />
              {aiRetrievedContext.length > 0
                ? `Retrieved context (${aiRetrievedContext.length})`
                : 'Retrieved context (none matched)'}
              <ChevronDown size={12} className={`transition-transform ${showRetrievedContext ? 'rotate-180' : ''}`} />
            </button>
            {showRetrievedContext && (
              <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                {aiRetrievedContext.length === 0 ? (
                  <p className="text-xs text-charcoal-400 italic px-3 py-2">
                    No macro or policy snippet matched this ticket closely enough — the draft was written from scratch.
                  </p>
                ) : (
                  aiRetrievedContext.map((snippet, i) => (
                    <div key={i} className="bg-sand-50 border border-sand-200 rounded-lg px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-medium text-charcoal-600">{snippet.source}</span>
                        <span className="text-[10px] text-charcoal-400 shrink-0">relevance {snippet.score.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-charcoal-500 whitespace-pre-wrap leading-relaxed">{snippet.content}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        <textarea
          rows={5}
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder={mode === 'note' ? 'Add an internal note (not sent to customer)…' : `Reply to ${ticket.fromName}…`}
          className={`w-full text-sm resize-none focus:outline-none placeholder:text-charcoal-300 leading-relaxed ${mode === 'note' ? 'text-amber-900' : 'text-charcoal-700'}`}
        />
        {aiHasDrafted && (
          <div className="flex items-center gap-2 mt-3">
            <input
              type="text"
              value={aiGuidance}
              onChange={(e) => setAiGuidance(e.target.value)}
              placeholder="Not quite right? Add guidance and regenerate — e.g. offer store credit instead of a refund"
              className="flex-1 text-xs px-3 py-1.5 border border-sand-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-terracotta-300 placeholder:text-charcoal-300"
            />
            <button
              onClick={() => draftWithAI(aiGuidance)}
              disabled={aiDrafting}
              className="flex items-center gap-1 shrink-0 text-xs font-medium text-charcoal-500 hover:text-terracotta-600 px-2 py-1.5 disabled:opacity-50"
            >
              {aiDrafting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Regenerate
            </button>
            <button
              onClick={saveGuidanceAsNote}
              disabled={savingGuidanceNote || !aiGuidance.trim()}
              title="Save this guidance as a standing note for future tickets (Agent tab)"
              className="flex items-center gap-1 shrink-0 text-xs font-medium text-charcoal-500 hover:text-terracotta-600 px-2 py-1.5 disabled:opacity-50"
            >
              {savingGuidanceNote ? <Loader2 size={12} className="animate-spin" /> : <BookmarkPlus size={12} />}
              {savedGuidanceNote ? 'Saved' : 'Save as general guidance'}
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-sand-100 gap-3">
          {mode === 'reply' ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => changeStatus('archived')}
                  className="px-4 py-2 text-sm font-medium text-charcoal-500 hover:text-charcoal-700 bg-sand-100 hover:bg-sand-200 border border-sand-300 rounded-xl transition-colors"
                >
                  Move to Archive
                </button>
                <button
                  onClick={() => changeStatus('needs attention')}
                  className="px-4 py-2 text-sm font-medium text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors"
                >
                  Flag → Needs Attention
                </button>
                <button
                  onClick={() => changeStatus('spam')}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors"
                >
                  <Ban size={14} /> Mark as spam
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => sendReply()}
                  disabled={sending || !replyBody.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-charcoal-600 hover:text-charcoal-800 bg-white border border-sand-300 hover:bg-sand-50 rounded-xl transition-colors disabled:opacity-50"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send reply
                </button>
                <button
                  onClick={() => sendReply('resolved')}
                  disabled={sending || !replyBody.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-terracotta-500 hover:bg-terracotta-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send &amp; Resolve
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-end w-full">
              <button
                onClick={() => sendReply()}
                disabled={sending || !replyBody.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : null}
                Save note
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Macro Manager ───────────────────────────────────────────────────────────

function MacroManager() {
  const [macros, setMacros] = useState<CSMacro[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBody, setEditBody] = useState('')

  useEffect(() => {
    fetch('/api/cs/macros').then((r) => r.json()).then((d) => {
      setMacros(d.macros ?? [])
      setLoading(false)
    })
  }, [])

  async function createMacro() {
    if (!name.trim() || !body.trim()) return
    setSaving(true)
    const res = await fetch('/api/cs/macros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, body }),
    })
    const d = await res.json()
    if (res.ok) { setMacros((p) => [...p, d.macro]); setName(''); setBody('') }
    setSaving(false)
  }

  async function saveMacro(id: string) {
    const res = await fetch(`/api/cs/macros/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, body: editBody }),
    })
    const d = await res.json()
    if (res.ok) {
      setMacros((p) => p.map((m) => m.id === id ? d.macro : m))
      setEditId(null)
    }
  }

  async function deleteMacro(id: string) {
    await fetch(`/api/cs/macros/${id}`, { method: 'DELETE' })
    setMacros((p) => p.filter((m) => m.id !== id))
  }

  if (loading) return <LoadingSpinner label="Loading macros…" />

  return (
    <div>
      {/* Create form */}
      <div className="bg-white rounded-2xl shadow-card p-6 mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">New Macro</h3>
        <input
          type="text"
          placeholder="Macro name (e.g. Shipping delay apology)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm border border-sand-300 rounded-xl px-4 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-terracotta-200 focus:border-terracotta-400 transition-all placeholder:text-charcoal-300"
        />
        <textarea
          rows={5}
          placeholder="Hi {{name}},&#10;&#10;Thank you for reaching out…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full text-sm border border-sand-300 rounded-xl px-4 py-2.5 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-terracotta-200 focus:border-terracotta-400 transition-all placeholder:text-charcoal-300"
        />
        <button
          onClick={createMacro}
          disabled={saving || !name.trim() || !body.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-terracotta-500 hover:bg-terracotta-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Save macro
        </button>
      </div>

      {/* Macro list */}
      {macros.length === 0 ? (
        <p className="text-sm text-charcoal-400 text-center py-10">No macros yet — create one above.</p>
      ) : (
        <div className="space-y-3">
          {macros.map((m) => (
            <div key={m.id} className="bg-white rounded-2xl shadow-card p-5">
              {editId === m.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-sm font-medium border border-sand-300 rounded-xl px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-terracotta-200"
                  />
                  <textarea
                    rows={4}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="w-full text-sm border border-sand-300 rounded-xl px-3 py-2 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-terracotta-200"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveMacro(m.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-olive-600 text-white rounded-lg hover:bg-olive-700 transition-colors">
                      <Check size={12} /> Save
                    </button>
                    <button onClick={() => setEditId(null)} className="flex items-center gap-1 text-xs px-3 py-1.5 border border-sand-300 text-charcoal-500 rounded-lg hover:bg-sand-100 transition-colors">
                      <X size={12} /> Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-charcoal-700 text-sm">{m.name}</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setEditId(m.id); setEditName(m.name); setEditBody(m.body) }}
                        className="p-1.5 text-charcoal-400 hover:text-charcoal-700 hover:bg-sand-100 rounded-lg transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => deleteMacro(m.id)}
                        className="p-1.5 text-charcoal-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-charcoal-500 whitespace-pre-wrap leading-relaxed line-clamp-3">{m.body}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Agent Guidance ────────────────────────────────────────────────────────────

function AgentGuidancePanel() {
  const [agentName, setAgentName] = useState('')
  const [toneOfVoice, setToneOfVoice] = useState('')
  const [standardMessage, setStandardMessage] = useState('')
  const [notes, setNotes] = useState<AgentGuidanceNote[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savingAgentName, setSavingAgentName] = useState(false)
  const [savedAgentName, setSavedAgentName] = useState(false)
  const [savingStandardMessage, setSavingStandardMessage] = useState(false)
  const [savedStandardMessage, setSavedStandardMessage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')

  useEffect(() => {
    fetch('/api/cs/agent-guidance').then((r) => r.json()).then((d) => {
      setAgentName(d.agentName ?? '')
      setToneOfVoice(d.toneOfVoice ?? '')
      setStandardMessage(d.standardMessage ?? '')
      setNotes(d.notes ?? [])
      setLoading(false)
    })
  }, [])

  function addNote() {
    if (!newTitle.trim() || !newBody.trim()) return
    setNotes((prev) => [...prev, { id: crypto.randomUUID(), title: newTitle.trim(), body: newBody.trim(), createdAt: new Date().toISOString() }])
    setNewTitle('')
    setNewBody('')
  }

  function saveEditedNote(id: string) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, title: editTitle.trim(), body: editBody.trim(), updatedAt: new Date().toISOString() } : n))
    setEditId(null)
  }

  function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  // The API always saves the whole guidance object (no partial-update support — it's a
  // small settings blob, not worth a PATCH endpoint) — per-field "Save" buttons below send
  // the current full state too, they just track their own saving/saved indicator.
  async function persistGuidance(): Promise<void> {
    const res = await fetch('/api/cs/agent-guidance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, toneOfVoice, standardMessage, notes }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
  }

  async function saveAll() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await persistGuidance()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveAgentName() {
    setSavingAgentName(true)
    setError(null)
    setSavedAgentName(false)
    try {
      await persistGuidance()
      setSavedAgentName(true)
      setTimeout(() => setSavedAgentName(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingAgentName(false)
    }
  }

  async function saveStandardMessage() {
    setSavingStandardMessage(true)
    setError(null)
    setSavedStandardMessage(false)
    try {
      await persistGuidance()
      setSavedStandardMessage(true)
      setTimeout(() => setSavedStandardMessage(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingStandardMessage(false)
    }
  }

  if (loading) return <LoadingSpinner label="Loading agent guidance…" />

  return (
    <div>
      <p className="text-sm text-charcoal-400 mb-4">
        Standing instructions used by &ldquo;Draft with AI&rdquo; on every future ticket — name, tone of voice, a standard closing message, and how to handle specific recurring situations. Saving here doesn&rsquo;t send or draft anything; it only changes what future drafts start from.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card p-6 mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">Agent name</h3>
        <input
          type="text"
          placeholder="e.g. Carla"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          className="w-full text-sm border border-sand-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-terracotta-200 focus:border-terracotta-400 transition-all placeholder:text-charcoal-300"
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-charcoal-400">Signs off every AI-drafted reply automatically (e.g. &ldquo;— {agentName || 'Carla'}&rdquo;). Leave blank for no signature.</p>
          <button
            onClick={saveAgentName}
            disabled={savingAgentName}
            className="flex items-center gap-1.5 shrink-0 ml-3 px-3 py-1.5 bg-terracotta-500 hover:bg-terracotta-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {savingAgentName ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {savedAgentName ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-6 mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">Tone of voice</h3>
        <input
          type="text"
          placeholder="e.g. Warm, concise, apologize first when something went wrong"
          value={toneOfVoice}
          onChange={(e) => setToneOfVoice(e.target.value)}
          className="w-full text-sm border border-sand-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-terracotta-200 focus:border-terracotta-400 transition-all placeholder:text-charcoal-300"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-card p-6 mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">Standard message</h3>
        <textarea
          rows={3}
          placeholder="e.g. Thanks for shopping with us — free returns within 30 days."
          value={standardMessage}
          onChange={(e) => setStandardMessage(e.target.value)}
          className="w-full text-sm border border-sand-300 rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-terracotta-200 focus:border-terracotta-400 transition-all placeholder:text-charcoal-300"
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-charcoal-400">Appended exactly as written to the end of every AI-drafted reply, after the signature. Leave blank to skip.</p>
          <button
            onClick={saveStandardMessage}
            disabled={savingStandardMessage}
            className="flex items-center gap-1.5 shrink-0 ml-3 px-3 py-1.5 bg-terracotta-500 hover:bg-terracotta-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {savingStandardMessage ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {savedStandardMessage ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* New note form */}
      <div className="bg-white rounded-2xl shadow-card p-6 mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-4">New Guidance Note</h3>
        <input
          type="text"
          placeholder="Title (e.g. Refunds over €100)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="w-full text-sm border border-sand-300 rounded-xl px-4 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-terracotta-200 focus:border-terracotta-400 transition-all placeholder:text-charcoal-300"
        />
        <textarea
          rows={4}
          placeholder="How should the agent handle this situation?"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          className="w-full text-sm border border-sand-300 rounded-xl px-4 py-2.5 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-terracotta-200 focus:border-terracotta-400 transition-all placeholder:text-charcoal-300"
        />
        <button
          onClick={addNote}
          disabled={!newTitle.trim() || !newBody.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-terracotta-500 hover:bg-terracotta-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          <Plus size={14} /> Add note
        </button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm text-charcoal-400 text-center py-10">No guidance notes yet — add one above.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {notes.map((n) => (
            <div key={n.id} className="bg-white rounded-2xl shadow-card p-5">
              {editId === n.id ? (
                <>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full text-sm font-medium border border-sand-300 rounded-xl px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-terracotta-200"
                  />
                  <textarea
                    rows={4}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="w-full text-sm border border-sand-300 rounded-xl px-3 py-2 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-terracotta-200"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEditedNote(n.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-olive-600 text-white rounded-lg hover:bg-olive-700 transition-colors">
                      <Check size={12} /> Save
                    </button>
                    <button onClick={() => setEditId(null)} className="flex items-center gap-1 text-xs px-3 py-1.5 border border-sand-300 text-charcoal-500 rounded-lg hover:bg-sand-100 transition-colors">
                      <X size={12} /> Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-charcoal-700 text-sm">{n.title}</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setEditId(n.id); setEditTitle(n.title); setEditBody(n.body) }}
                        className="p-1.5 text-charcoal-400 hover:text-charcoal-700 hover:bg-sand-100 rounded-lg transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => deleteNote(n.id)}
                        className="p-1.5 text-charcoal-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-charcoal-500 whitespace-pre-wrap leading-relaxed">{n.body}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={saveAll}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-terracotta-500 hover:bg-terracotta-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {saved ? 'Saved' : 'Save changes'}
      </button>
    </div>
  )
}

// ─── Tags Overview ───────────────────────────────────────────────────────────

function TagsOverview({
  tickets,
  customTags,
  hiddenTags,
  onSelectTicket,
  onTagDeleted,
  onTagCreated,
}: {
  tickets: CSTicket[]
  customTags: string[]
  hiddenTags: string[]
  onSelectTicket: (ticket: CSTicket) => void
  onTagDeleted: (tag: string, isPredefined: boolean) => void
  onTagCreated: (tag: string) => void
}) {
  const [expandedTag, setExpandedTag] = useState<string | null>(null)
  const [deletingTag, setDeletingTag] = useState<string | null>(null)
  const [addingTag, setAddingTag] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')
  const [savingTag, setSavingTag] = useState(false)

  const visiblePredefined = (TICKET_TAGS as readonly string[]).filter((t) => !hiddenTags.includes(t))
  const allTags = [...visiblePredefined, ...customTags]
  const total = tickets.length

  async function createTag() {
    const tag = newTagValue.trim().toLowerCase()
    if (!tag) return
    setSavingTag(true)
    await fetch('/api/cs/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tag }),
    })
    onTagCreated(tag)
    setNewTagValue('')
    setAddingTag(false)
    setSavingTag(false)
  }

  async function deleteTag(tag: string, isPredefined: boolean, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete tag "${tag}"? It will be removed from all tickets.`)) return
    setDeletingTag(tag)
    await fetch('/api/cs/tags', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tag }),
    })
    onTagDeleted(tag, isPredefined)
    if (expandedTag === tag) setExpandedTag(null)
    setDeletingTag(null)
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-charcoal-400">{allTags.length} tags · {total} tickets total</p>
        {addingTag ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={newTagValue}
              onChange={(e) => setNewTagValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createTag()
                if (e.key === 'Escape') { setAddingTag(false); setNewTagValue('') }
              }}
              placeholder="Tag name…"
              className="text-sm border border-terracotta-300 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-terracotta-200 w-44"
            />
            <button
              onClick={createTag}
              disabled={savingTag || !newTagValue.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-terracotta-500 hover:bg-terracotta-600 text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              {savingTag ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save
            </button>
            <button
              onClick={() => { setAddingTag(false); setNewTagValue('') }}
              className="px-3 py-1.5 text-xs text-charcoal-400 hover:text-charcoal-600 border border-sand-300 rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingTag(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-charcoal-600 hover:text-charcoal-800 bg-white border border-sand-300 hover:bg-sand-50 rounded-xl transition-colors"
          >
            <Plus size={13} /> Create tag
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sand-100 text-left border-b border-sand-200">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400 w-8"></th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Tag</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Type</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">Tickets</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-charcoal-400">% of total</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-100">
            {allTags.map((tag) => {
              const tagged = tickets.filter((t) => t.tags.includes(tag))
              const pct = total > 0 ? Math.round((tagged.length / total) * 100) : 0
              const isCustom = !(TICKET_TAGS as readonly string[]).includes(tag)
              const isExpanded = expandedTag === tag

              return (
                <>
                  <tr
                    key={tag}
                    onClick={() => setExpandedTag(isExpanded ? null : tag)}
                    className="hover:bg-cream-100 cursor-pointer transition-colors"
                  >
                    <td className="pl-5 pr-2 py-3.5 text-charcoal-300">
                      <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-terracotta-100 text-terracotta-700 border border-terracotta-200 capitalize">
                        {tag}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium ${isCustom ? 'text-olive-600' : 'text-charcoal-400'}`}>
                        {isCustom ? 'Custom' : 'Predefined'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-charcoal-600 font-medium">{tagged.length}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-24 h-1.5 bg-sand-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-terracotta-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-charcoal-500 tabular-nums w-8">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={(e) => deleteTag(tag, !isCustom, e)}
                        disabled={deletingTag === tag}
                        className="p-1.5 text-charcoal-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete tag"
                      >
                        {deletingTag === tag ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr key={`${tag}-expanded`}>
                      <td colSpan={6} className="bg-sand-50 px-5 py-3 border-b border-sand-100">
                        {tagged.length === 0 ? (
                          <p className="text-xs text-charcoal-300 italic py-1">No tickets tagged with this yet.</p>
                        ) : (
                          <div className="divide-y divide-sand-100">
                            {tagged
                              .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
                              .map((t) => (
                                <button
                                  key={t.id}
                                  onClick={(e) => { e.stopPropagation(); onSelectTicket(t) }}
                                  className="w-full flex items-center gap-4 py-2.5 px-2 text-left hover:bg-sand-100 rounded-lg transition-colors group"
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-charcoal-700 group-hover:text-terracotta-600 transition-colors">
                                      {t.fromName}
                                    </span>
                                    <span className="text-charcoal-300 mx-2">·</span>
                                    <span className="text-xs text-charcoal-400 truncate">{t.subject}</span>
                                  </div>
                                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[t.status]}`}>
                                    {t.status}
                                  </span>
                                  <span className="shrink-0 text-xs text-charcoal-400 whitespace-nowrap">
                                    {fmtDate(t.receivedAt)}
                                  </span>
                                </button>
                              ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tickets Pane (shared between the "Tickets" (email) and "Instagram" tabs) ────────────────

function TicketsPane({
  channel,
  allTickets,
  setTickets,
  macros,
  customTags,
  setCustomTags,
  hiddenTags,
  customers,
  customerTagByEmail,
  connected,
  connectHref,
  ConnectIcon,
  connectTitle,
  connectDescription,
  connectButtonLabel,
  itemLabel,
  syncing,
  onSync,
  syncIdleLabel,
  emptyHint,
  onNavigateToCustomer,
  openTicketId,
  onOpenTicketHandled,
  openReplyBody,
  onOpenReplyBodyHandled,
}: {
  channel: TicketChannel
  allTickets: CSTicket[]
  setTickets: React.Dispatch<React.SetStateAction<CSTicket[]>>
  macros: CSMacro[]
  customTags: string[]
  setCustomTags: React.Dispatch<React.SetStateAction<string[]>>
  hiddenTags: string[]
  customers: EnrichedCustomer[]
  customerTagByEmail: Map<string, string>
  connected: boolean
  connectHref: string
  ConnectIcon: typeof Mail
  connectTitle: string
  connectDescription: string
  connectButtonLabel: string
  itemLabel: string
  syncing: boolean
  onSync: () => void
  syncIdleLabel: string
  emptyHint: string
  onNavigateToCustomer?: (email: string) => void
  openTicketId?: string | null
  onOpenTicketHandled?: () => void
  openReplyBody?: string | null
  onOpenReplyBodyHandled?: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<TicketStatus>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<TicketSortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedTicket, setSelectedTicket] = useState<CSTicket | null>(null)
  const [pendingReplyBody, setPendingReplyBody] = useState<{ ticketId: string; body: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkMoving, setBulkMoving] = useState(false)
  const [hiddenEmails, setHiddenEmails] = useState<Set<string>>(new Set())

  const tickets = useMemo(() => allTickets.filter((t) => t.channel === channel), [allTickets, channel])

  function handleSort(key: TicketSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'date' ? 'desc' : 'asc')
    }
  }

  function toggleEmailVisibility(email: string) {
    const key = email.toLowerCase()
    setHiddenEmails((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const allEmailsHidden = tickets.length > 0 && tickets.every((t) => hiddenEmails.has(t.from.toLowerCase()))
  function toggleAllEmails() {
    setHiddenEmails(allEmailsHidden ? new Set() : new Set(tickets.map((t) => t.from.toLowerCase())))
  }

  // Deep-links (e.g. from the shipping-delay/sold-out-ticket flows in Sales Overview) always
  // target a ticket already loaded into `tickets` for this pane's channel.
  useEffect(() => {
    if (!openTicketId) return
    const found = tickets.find((t) => t.id === openTicketId)
    if (found) {
      setStatusFilter(found.status)
      setSelectedTicket(found)
      setPendingReplyBody(openReplyBody ? { ticketId: found.id, body: openReplyBody } : null)
    }
    onOpenTicketHandled?.()
    onOpenReplyBodyHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTicketId])

  const q = searchQuery.trim().toLowerCase()
  const filtered = tickets
    .filter((t) => t.status === statusFilter)
    .filter((t) => {
      if (!q) return true
      return (
        t.from.toLowerCase().includes(q) ||
        t.fromName.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.thread.some((m) => m.body.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'from': cmp = a.fromName.localeCompare(b.fromName); break
        case 'subject': cmp = a.subject.localeCompare(b.subject); break
        case 'date': cmp = a.receivedAt.localeCompare(b.receivedAt); break
        case 'status': cmp = a.status.localeCompare(b.status); break
        case 'stage': {
          const sa = customerTagByEmail.get(a.from.toLowerCase()) ?? ''
          const sb = customerTagByEmail.get(b.from.toLowerCase()) ?? ''
          cmp = sa.localeCompare(sb)
          break
        }
        case 'tags': cmp = a.tags.join(',').localeCompare(b.tags.join(',')); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  const allSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))

  function toggleOne(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedIds(e.target.checked ? new Set(filtered.map((t) => t.id)) : new Set())
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    const remoteNote = channel === 'email' ? ' This also removes them from Outlook.' : ' This cannot be undone.'
    if (!confirm(`Delete ${selectedIds.size} ticket${selectedIds.size > 1 ? 's' : ''}?${remoteNote}`)) return
    setBulkDeleting(true)
    await Promise.all(
      Array.from(selectedIds).map((id) => fetch(`/api/cs/tickets/${id}`, { method: 'DELETE' }))
    )
    setTickets((prev) => prev.filter((t) => !selectedIds.has(t.id)))
    setSelectedIds(new Set())
    setBulkDeleting(false)
  }

  async function bulkChangeStatus(status: TicketStatus) {
    if (selectedIds.size === 0) return
    setBulkMoving(true)
    await Promise.all(
      Array.from(selectedIds).map((id) =>
        fetch(`/api/cs/tickets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
      )
    )
    setTickets((prev) => prev.map((t) => selectedIds.has(t.id) ? { ...t, status } : t))
    setSelectedIds(new Set())
    setBulkMoving(false)
  }

  async function quickMarkSpam(id: string) {
    const res = await fetch(`/api/cs/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'spam' }),
    })
    const data = await res.json()
    if (res.ok) setTickets((prev) => prev.map((t) => t.id === id ? data.ticket : t))
  }

  const counts: Record<TicketStatus, number> = {
    open: tickets.filter((t) => t.status === 'open').length,
    'needs attention': tickets.filter((t) => t.status === 'needs attention').length,
    archived: tickets.filter((t) => t.status === 'archived').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    spam: tickets.filter((t) => t.status === 'spam').length,
  }

  if (!connected) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl shadow-card">
        <ConnectIcon size={32} className="mx-auto text-charcoal-300 mb-4" />
        <h3 className="font-serif text-xl text-charcoal-600 mb-2">{connectTitle}</h3>
        <p className="text-sm text-charcoal-400 mb-6">{connectDescription}</p>
        <a
          href={connectHref}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-terracotta-500 hover:bg-terracotta-600 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <ConnectIcon size={14} /> {connectButtonLabel}
        </a>
      </div>
    )
  }

  if (selectedTicket) {
    const idx = filtered.findIndex((t) => t.id === selectedTicket.id)
    return (
      <TicketDetail
        key={selectedTicket.id}
        ticket={selectedTicket}
        macros={macros}
        customTags={customTags}
        hiddenTags={hiddenTags}
        hasPrev={idx > 0}
        hasNext={idx < filtered.length - 1}
        onPrev={() => setSelectedTicket(filtered[idx - 1])}
        onNext={() => setSelectedTicket(filtered[idx + 1])}
        onBack={() => { setSelectedTicket(null); setPendingReplyBody(null) }}
        initialReplyBody={pendingReplyBody?.ticketId === selectedTicket.id ? pendingReplyBody.body : undefined}
        onTagCreated={(tag) => setCustomTags((prev) => prev.includes(tag) ? prev : [...prev, tag])}
        onNavigateToCustomer={onNavigateToCustomer}
        emailHidden={hiddenEmails.has(selectedTicket.from.toLowerCase())}
        onToggleEmail={() => toggleEmailVisibility(selectedTicket.from)}
        customerTag={customerTagByEmail.get(selectedTicket.from.toLowerCase())}
        customers={customers}
        onUpdated={(updated) => {
          setTickets((prev) => prev.map((t) => t.id === updated.id ? updated : t))
          setSelectedTicket(updated)
        }}
        onDeleted={(id) => {
          setTickets((prev) => prev.filter((t) => t.id !== id))
          setSelectedTicket(null)
        }}
      />
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 items-center flex-wrap">
            {(['open', 'needs attention', 'archived', 'resolved', 'spam'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setSelectedIds(new Set()) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors
                  ${statusFilter === s
                    ? 'bg-terracotta-500 text-white'
                    : 'bg-white border border-sand-300 text-charcoal-500 hover:bg-sand-100'
                  }`}
              >
                {s} {counts[s] > 0 && <span className="ml-1 opacity-70">({counts[s]})</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <HideAllEmailsButton allHidden={allEmailsHidden} onClick={toggleAllEmails} itemLabel={itemLabel === 'email' ? 'emails' : 'contacts'} />
            <button
              onClick={onSync}
              disabled={syncing}
              className="flex items-center gap-2 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-terracotta-100 disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : syncIdleLabel}
            </button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-terracotta-50 border border-terracotta-200 rounded-xl flex-wrap">
            <span className="text-xs font-semibold text-terracotta-700 mr-1">
              {selectedIds.size} selected — move to:
            </span>
            {(['open', 'needs attention', 'archived', 'resolved', 'spam'] as const)
              .filter((s) => s !== statusFilter && s !== 'spam')
              .map((s) => (
                <button
                  key={s}
                  onClick={() => bulkChangeStatus(s)}
                  disabled={bulkMoving || bulkDeleting}
                  className="px-3 py-1 text-xs font-medium rounded-lg capitalize border border-sand-300 bg-white text-charcoal-600 hover:bg-sand-100 transition-colors disabled:opacity-50"
                >
                  {bulkMoving ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
                  {s}
                </button>
              ))}
            {statusFilter !== 'spam' && (
              <button
                onClick={() => bulkChangeStatus('spam')}
                disabled={bulkMoving || bulkDeleting}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {bulkMoving ? <Loader2 size={10} className="animate-spin" /> : <Ban size={10} />}
                Mark as spam
              </button>
            )}
            <div className="ml-auto">
              <button
                onClick={bulkDelete}
                disabled={bulkDeleting || bulkMoving}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {bulkDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        )}

        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search by sender or message content…`}
          className="w-full text-sm border border-sand-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-terracotta-200 focus:border-terracotta-400 transition-all placeholder:text-charcoal-300 bg-white"
        />
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-card text-charcoal-400">
          <Inbox size={28} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">{q ? 'No matching tickets' : 'No tickets'}</p>
          <p className="text-sm mt-1">{q ? 'Try a different search term.' : emptyHint}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-sand-100 text-left">
                <th className="pl-5 pr-2 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-sand-400 text-terracotta-500 focus:ring-terracotta-300 cursor-pointer"
                  />
                </th>
                <SortableTh label="From" sortKeyValue="from" activeKey={sortKey} dir={sortDir} onSort={handleSort} widthClass="w-[22%]" />
                <SortableTh label="Subject" sortKeyValue="subject" activeKey={sortKey} dir={sortDir} onSort={handleSort} widthClass="w-[26%]" />
                <SortableTh label="Date" sortKeyValue="date" activeKey={sortKey} dir={sortDir} onSort={handleSort} widthClass="w-[16%]" />
                <SortableTh label="Status" sortKeyValue="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} widthClass="w-[12%]" />
                <SortableTh label="Stage" sortKeyValue="stage" activeKey={sortKey} dir={sortDir} onSort={handleSort} widthClass="w-[12%]" />
                <SortableTh label="Tags" sortKeyValue="tags" activeKey={sortKey} dir={sortDir} onSort={handleSort} widthClass="w-[12%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {filtered.map((t) => {
                const custTag = customerTagByEmail.get(t.from.toLowerCase())
                return (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className={`hover:bg-cream-100 cursor-pointer transition-colors ${selectedIds.has(t.id) ? 'bg-terracotta-50' : ''}`}
                >
                  <td className="pl-5 pr-2 py-4" onClick={(e) => toggleOne(t.id, e)}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => {}}
                      className="rounded border-sand-400 text-terracotta-500 focus:ring-terracotta-300 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-4 min-w-0" onClick={(e) => e.stopPropagation()}>
                    <p className="font-medium text-charcoal-700 flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{t.fromName}</span>
                      {isLikelySpamSender(t.from) && (
                        <span title="Possible spam sender">
                          <ShieldAlert size={13} className="text-red-500 shrink-0" />
                        </span>
                      )}
                      {isLikelySpamSender(t.from) && t.status !== 'spam' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); quickMarkSpam(t.id) }}
                          title="Mark as spam"
                          className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                        >
                          <Ban size={13} />
                        </button>
                      )}
                    </p>
                    <p className="text-xs text-charcoal-400 mt-0.5 truncate">
                      <MaskedEmail
                        email={t.from}
                        hidden={hiddenEmails.has(t.from.toLowerCase())}
                        onToggle={() => toggleEmailVisibility(t.from)}
                        itemLabel={itemLabel}
                      />
                    </p>
                  </td>
                  <td className="px-4 py-4 text-charcoal-600 truncate">{t.subject}</td>
                  <td className="px-4 py-4 text-charcoal-400 truncate">{fmtDate(t.receivedAt)}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[t.status]}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {custTag ? <TagBadge tag={custTag} /> : <span className="text-xs text-charcoal-300">—</span>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {t.tags.length > 0
                        ? t.tags.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-sand-100 text-charcoal-500 border border-sand-200 capitalize">
                              {tag}
                            </span>
                          ))
                        : <span className="text-xs text-charcoal-300">—</span>}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Main section ────────────────────────────────────────────────────────────

export default function CustomerService({
  openTicketId,
  onOpenTicketHandled,
  openReplyBody,
  onOpenReplyBodyHandled,
  onNavigateToCustomer,
  onBackToSalesOverview,
}: {
  openTicketId?: string | null
  onOpenTicketHandled?: () => void
  openReplyBody?: string | null
  onOpenReplyBodyHandled?: () => void
  onNavigateToCustomer?: (email: string) => void
  onBackToSalesOverview?: () => void
} = {}) {
  const [tab, setTab] = useState<'tickets' | 'instagram' | 'macros' | 'tags' | 'agent'>('tickets')
  const [tickets, setTickets] = useState<CSTicket[]>([])
  const [macros, setMacros] = useState<CSMacro[]>([])
  const [customTags, setCustomTags] = useState<string[]>([])
  const [hiddenTags, setHiddenTags] = useState<string[]>([])
  const [msConnected, setMsConnected] = useState(false)
  const [igConnected, setIgConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncingInstagram, setSyncingInstagram] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<EnrichedCustomer[]>([])

  const customerTagByEmail = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers) {
      if (c.email && c.computedTags?.length) map.set(c.email.toLowerCase(), c.computedTags[0])
    }
    return map
  }, [customers])

  const { includeDummy } = useDummyData()

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ticketRes, macroRes, tagRes, custRes] = await Promise.all([
        fetch(withDummyParam('/api/cs/tickets', includeDummy)),
        fetch('/api/cs/macros'),
        fetch('/api/cs/tags'),
        fetch(withDummyParam('/api/shopify/customers', includeDummy)),
      ])
      const td = await ticketRes.json()
      const md = await macroRes.json()
      const tgd = await tagRes.json()
      const cd = await custRes.json()
      if (!ticketRes.ok) throw new Error(td.error)
      setTickets(td.tickets ?? [])
      setMsConnected(td.msConnected ?? false)
      setIgConnected(td.igConnected ?? false)
      setMacros(md.macros ?? [])
      setCustomTags(tgd.tags ?? [])
      setHiddenTags(tgd.hidden ?? [])
      if (custRes.ok) setCustomers(cd.customers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [includeDummy])

  useEffect(() => { loadTickets() }, [loadTickets])

  // Deep-links only ever target email tickets today (Sales Overview's shipping-delay/sold-out
  // flows) — jump to the Tickets tab; the email TicketsPane instance handles the actual selection.
  useEffect(() => {
    if (!openTicketId || loading) return
    if (tickets.some((t) => t.id === openTicketId)) setTab('tickets')
  }, [openTicketId, loading, tickets])

  async function sync() {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/cs/tickets/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await loadTickets()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function syncInstagram() {
    setSyncingInstagram(true)
    setError(null)
    try {
      const res = await fetch('/api/cs/instagram/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await loadTickets()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncingInstagram(false)
    }
  }

  return (
    <section className="max-w-full">
      {onBackToSalesOverview && (
        <button
          onClick={onBackToSalesOverview}
          className="flex items-center gap-1.5 text-sm text-charcoal-400 hover:text-terracotta-500 transition-colors mb-4"
        >
          <ArrowLeft size={14} /> Back to Sales Overview
        </button>
      )}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight">Customer Service</h2>
          <p className="text-sm text-charcoal-400 mt-1.5">Manage support tickets and response macros</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-sand-100 rounded-xl p-1">
          <button
            onClick={() => setTab('tickets')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all
              ${tab === 'tickets' ? 'bg-white text-charcoal-700 shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
          >
            <Inbox size={13} /> Tickets
          </button>
          <button
            onClick={() => setTab('instagram')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all
              ${tab === 'instagram' ? 'bg-white text-charcoal-700 shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
          >
            <Instagram size={13} /> Instagram
          </button>
          <button
            onClick={() => setTab('tags')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all
              ${tab === 'tags' ? 'bg-white text-charcoal-700 shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
          >
            <Tag size={13} /> Tags
          </button>
          <button
            onClick={() => setTab('macros')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all
              ${tab === 'macros' ? 'bg-white text-charcoal-700 shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
          >
            <BookOpen size={13} /> Macros
          </button>
          <button
            onClick={() => setTab('agent')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all
              ${tab === 'agent' ? 'bg-white text-charcoal-700 shadow-sm' : 'text-charcoal-400 hover:text-charcoal-600'}`}
          >
            <Settings2 size={13} /> Agent
          </button>
        </div>
      </div>

      {tab === 'macros' && <MacroManager />}

      {tab === 'agent' && <AgentGuidancePanel />}

      {tab === 'tags' && (
        <TagsOverview
          tickets={tickets}
          customTags={customTags}
          hiddenTags={hiddenTags}
          onSelectTicket={(ticket) => {
            setTab(ticket.channel === 'instagram' ? 'instagram' : 'tickets')
          }}
          onTagDeleted={(tag, isPredefined) => {
            if (isPredefined) {
              setHiddenTags((prev) => [...prev, tag])
            } else {
              setCustomTags((prev) => prev.filter((t) => t !== tag))
            }
            setTickets((prev) => prev.map((t) => ({ ...t, tags: t.tags.filter((tg) => tg !== tag) })))
          }}
          onTagCreated={(tag) => setCustomTags((prev) => prev.includes(tag) ? prev : [...prev, tag])}
        />
      )}

      {(tab === 'tickets' || tab === 'instagram') && (
        <>
          {loading && <LoadingSpinner label="Loading tickets…" />}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 mb-4">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {!loading && tab === 'tickets' && (
            <TicketsPane
              channel="email"
              allTickets={tickets}
              setTickets={setTickets}
              macros={macros}
              customTags={customTags}
              setCustomTags={setCustomTags}
              hiddenTags={hiddenTags}
              customers={customers}
              customerTagByEmail={customerTagByEmail}
              connected={msConnected}
              connectHref="/api/ms/auth"
              ConnectIcon={Mail}
              connectTitle="Connect your Outlook inbox"
              connectDescription="Sign in once to start syncing support emails from hola@carladopazo.com"
              connectButtonLabel="Connect Outlook"
              itemLabel="email"
              syncing={syncing}
              onSync={sync}
              syncIdleLabel="Sync inbox"
              emptyHint='Click "Sync inbox" to pull in new emails.'
              onNavigateToCustomer={onNavigateToCustomer}
              openTicketId={openTicketId}
              onOpenTicketHandled={onOpenTicketHandled}
              openReplyBody={openReplyBody}
              onOpenReplyBodyHandled={onOpenReplyBodyHandled}
            />
          )}

          {!loading && tab === 'instagram' && (
            <TicketsPane
              channel="instagram"
              allTickets={tickets}
              setTickets={setTickets}
              macros={macros}
              customTags={customTags}
              setCustomTags={setCustomTags}
              hiddenTags={hiddenTags}
              customers={customers}
              customerTagByEmail={customerTagByEmail}
              connected={igConnected}
              connectHref="/api/instagram/auth"
              ConnectIcon={Instagram}
              connectTitle="Connect your Instagram account"
              connectDescription="Sign in once to start syncing DMs from your linked Instagram account"
              connectButtonLabel="Connect Instagram"
              itemLabel="contact info"
              syncing={syncingInstagram}
              onSync={syncInstagram}
              syncIdleLabel="Sync DMs"
              emptyHint='Click "Sync DMs" to pull in new messages.'
            />
          )}
        </>
      )}
    </section>
  )
}

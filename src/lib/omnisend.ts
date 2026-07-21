const API_KEY = process.env.OMNISEND_API_KEY!
const BASE = 'https://api.omnisend.com/v3'

function headers() {
  return {
    'X-API-KEY': API_KEY,
    'Content-Type': 'application/json',
  }
}

// Newer date-versioned Omnisend API (e.g. /segments) — different base URL and
// auth header than the stable v3 API used everywhere else in this app.
// Verified 2026-07-15: this auth header + version string return 200 against a
// live account (confirmed via GET /segments, which returned real segment data).
const DATED_BASE = 'https://api.omnisend.com/api'
const DATED_API_VERSION = '2026-03-15'

function datedHeaders() {
  return {
    'Authorization': `Omnisend-API-Key ${API_KEY}`,
    'Omnisend-Version': DATED_API_VERSION,
    'Content-Type': 'application/json',
  }
}

// Omnisend's dated API returns RFC7807 "problem+json" errors ({type, title,
// detail, retryAfter, errors}) — surface `detail` (+ a human retry hint, +
// any per-field validation messages) as a plain sentence instead of dumping
// the raw JSON blob, which is what callers otherwise show verbatim in the UI.
// Falls back to the raw text for any shape that doesn't match.
async function parseOmnisendError(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const body = JSON.parse(text) as { detail?: string; retryAfter?: number; errors?: { message?: string }[] }
    if (body.detail) {
      const retryHint = body.retryAfter ? ` (try again in ${formatRetryAfter(body.retryAfter)})` : ''
      const fieldMessages = (body.errors ?? []).map((e) => e.message).filter(Boolean)
      const fieldHint = fieldMessages.length > 0 ? ` — ${fieldMessages.join('; ')}` : ''
      return `${body.detail}${retryHint}${fieldHint}`
    }
  } catch {
    // not JSON, or not the expected shape — fall through to raw text
  }
  return text
}

function formatRetryAfter(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours > 0 ? `~${hours}h ${minutes}m` : `~${minutes}m`
}

export async function omnisendDatedGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${DATED_BASE}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: datedHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Omnisend ${res.status}: ${await parseOmnisendError(res)}`)
  return res.json()
}

export async function omnisendDatedPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${DATED_BASE}${path}`, {
    method: 'POST',
    headers: datedHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Omnisend ${res.status}: ${await parseOmnisendError(res)}`)
  return res.json()
}

export async function omnisendGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), { headers: headers(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Omnisend ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function omnisendPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Omnisend ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function omnisendPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Omnisend ${res.status}: ${await res.text()}`)
  return res.json()
}

interface OmnisendContactResult {
  contactID: string
  email: string
  tags?: string[]
}

// Finds a contact by email, or creates one as a subscribed contact if none exists —
// used for back-in-stock signups, which may come from people who aren't customers yet.
// This is the first place in the codebase that CREATES an Omnisend contact (everywhere
// else only searches/patches existing ones) — the /contacts POST body below follows
// Omnisend's documented v3 "identifiers" shape but is unverified against this account;
// iterate here if the response comes back malformed or contactID is missing.
// Counts total Omnisend contacts by paging through /contacts with manually
// incremented offset. Verified 2026-07-15 against a live account: /contacts also
// supports a cursor (paging.next, an "after" token) as its primary pagination
// mechanism, but manually incrementing offset returns identical results page-for-
// page — confirmed by comparing an offset=5 request against following paging.next
// directly. Capped at 20 pages (~5,000 contacts at the max page size) as a safety limit.
export async function countOmnisendContacts(): Promise<number> {
  const limit = 250
  let offset = 0
  let total = 0

  for (let page = 0; page < 20; page++) {
    const data = await omnisendGet<{ contacts: unknown[]; paging: { next: string | null } }>('/contacts', {
      limit: String(limit),
      offset: String(offset),
    })
    const count = data.contacts?.length ?? 0
    total += count
    if (count < limit || !data.paging?.next) break
    offset += limit
  }

  return total
}

// ─── Analytics reports (dated API) ──────────────────────────────────────────
// Verified 2026-07-21 against a live account: POST /analytics/reports accepts
// the existing API key (ApiKeyAuth is a valid alternative to the documented
// OAuth2 `analytics.read` scope). Metric/interval/dimension names below were
// discovered from the API's own validation error messages (it lists allowed
// values when given an invalid one), since the public docs page didn't expose
// them. Confirmed working metrics: sent, sentCost, opened, openedUnique,
// openRate, clicked, clickedUnique, clickRate, failed, failRate,
// markedAsSpamUnique, markedAsSpamRate, unsubscribedUnique, unsubscribeRate,
// attributedOrders, attributedOrdersUnique, attributedOrderRate,
// attributedRevenue, attributedRevenuePerOrder, attributedRevenuePerSent,
// totalOrders, totalRevenue. Confirmed intervals: last7Days, last30Days,
// last90Days, custom, thisWeek, lastWeek, thisMonth, lastMonth, lastYear,
// thisYear. `timestamp` dimension granularity must be week/month (not day)
// when interval spans more than ~30 days. No per-campaign/per-automation
// breakdown dimension found yet (channel/activity and other guesses all
// rejected) — this only supports account-wide aggregates for now.
export interface AnalyticsReportQuery {
  alias: string
  metrics: { name: string }[]
  dateRange: { interval: string; from?: string; to?: string }
  dimensions?: { name: string; granularity?: string }[]
  filters?: { name: string; operator: 'in' | 'notIn'; values: string[] }[]
}

export interface AnalyticsReportResult {
  alias: string
  dimensions: { name: string; granularity?: string }[]
  metrics: { name: string }[]
  rows: Record<string, string | number>[]
}

export async function omnisendAnalyticsReport(queries: AnalyticsReportQuery[]): Promise<AnalyticsReportResult[]> {
  const data = await omnisendDatedPost<{ reports: AnalyticsReportResult[] }>('/analytics/reports', { queries })
  return data.reports
}

// Per-workflow breakdown: confirmed 2026-07-21 via Omnisend support (not
// documented publicly) — dimension `marketingActivityID`, optionally paired
// with a `marketingActivityType: ["Automation"]` filter to exclude campaigns.
// Unverified end-to-end against a live response (discovered right as this
// account hit its daily analytics rate limit) — if the filter shape below
// turns out wrong, the route calling this will surface the API's error
// message rather than fail silently.
export const MARKETING_ACTIVITY_ID_DIMENSION = 'marketingActivityID'
export const MARKETING_ACTIVITY_TYPE_FILTER = 'marketingActivityType'

// ─── Automations (workflow structure — real name/steps/subject lines) ──────
export interface OmnisendAutomationBlock {
  id: string
  type: string
  delay?: { mode: string; duration: { units: string; amount: number } }
  action?: { type: string; sendEmail?: { contentID: string; subject: string; senderEmail?: string; senderName?: string } }
}

export interface OmnisendAutomation {
  id: string
  name: string
  isEnabled: boolean
  blocks: OmnisendAutomationBlock[]
  createdAt: string
  updatedAt?: string
  enabledAt?: string
}

export async function omnisendListAutomations(): Promise<OmnisendAutomation[]> {
  const data = await omnisendDatedGet<{ automations: OmnisendAutomation[] }>('/automations')
  return data.automations ?? []
}

export async function omnisendFindOrCreateContact(email: string): Promise<OmnisendContactResult> {
  const search = await omnisendGet<{ contacts: OmnisendContactResult[] }>('/contacts', { email })
  const existing = search.contacts?.[0]
  if (existing) return existing

  const now = new Date().toISOString()
  return omnisendPost<OmnisendContactResult>('/contacts', {
    email,
    status: 'subscribed',
    statusDate: now,
    identifiers: [
      {
        type: 'email',
        id: email,
        channels: { email: { status: 'subscribed', statusDate: now } },
      },
    ],
  })
}

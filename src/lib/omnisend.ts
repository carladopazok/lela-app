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
// Unverified against this account; iterate here if the version/auth is wrong.
const DATED_BASE = 'https://api.omnisend.com/api'
const DATED_API_VERSION = '2026-03-15'

function datedHeaders() {
  return {
    'Authorization': `Omnisend-API-Key ${API_KEY}`,
    'Omnisend-Version': DATED_API_VERSION,
    'Content-Type': 'application/json',
  }
}

export async function omnisendDatedGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${DATED_BASE}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: datedHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Omnisend ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function omnisendDatedPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${DATED_BASE}${path}`, {
    method: 'POST',
    headers: datedHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Omnisend ${res.status}: ${await res.text()}`)
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

const API_KEY = process.env.OMNISEND_API_KEY!
const BASE = 'https://api.omnisend.com/v3'

function headers() {
  return {
    'X-API-KEY': API_KEY,
    'Content-Type': 'application/json',
  }
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

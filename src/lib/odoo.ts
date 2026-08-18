// Minimal Odoo integration — a live connection-status check only. No data modeling,
// no data sync. See src/components/sections/Integrations.tsx for where this is surfaced.
//
// Uses Odoo's JSON-RPC endpoint (POST {ODOO_URL}/jsonrpc) rather than XML-RPC: it's
// plain JSON over fetch, consistent with every other integration in this codebase
// (src/lib/omnisend.ts, src/lib/ollama.ts, src/lib/ms-graph.ts all hand-roll fetch
// wrappers — no SDK packages are used for any external API here).
//
// The proof-of-connection call is `common.authenticate(db, username, api_key, {})`,
// Odoo's standard "does this credential pair work" RPC. It returns a numeric uid on
// success, `false` on bad credentials, or a JSON-RPC `error` object for anything else
// (bad DB name, bad URL, network failure, etc).

export type OdooConnectionResult = { connected: true; uid: number } | { connected: false; error: string }

interface OdooJsonRpcResponse {
  jsonrpc: string
  id: number
  result?: number | false
  error?: {
    code: number
    message: string
    data?: { name?: string; message?: string; debug?: string }
  }
}

export async function checkOdooConnection(): Promise<OdooConnectionResult> {
  const url = process.env.ODOO_URL
  const db = process.env.ODOO_DB
  const username = process.env.ODOO_USERNAME
  const apiKey = process.env.ODOO_API_KEY

  if (!url || !db || !username || !apiKey) {
    return {
      connected: false,
      error:
        'Odoo credentials are not configured — add ODOO_URL, ODOO_DB, ODOO_USERNAME, and ODOO_API_KEY to .env.local and restart the dev server.',
    }
  }

  const endpoint = `${url.replace(/\/+$/, '')}/jsonrpc`

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'common',
          method: 'authenticate',
          args: [db, username, apiKey, {}],
        },
        id: 1,
      }),
    })
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : 'Network error reaching Odoo' }
  }

  if (!res.ok) {
    return { connected: false, error: `Odoo ${res.status}: ${await res.text()}` }
  }

  const body = (await res.json()) as OdooJsonRpcResponse

  if (body.error) {
    return { connected: false, error: body.error.data?.message ?? body.error.message }
  }

  if (body.result === false) {
    return { connected: false, error: 'Invalid credentials — Odoo rejected the username/API key for this database.' }
  }

  if (typeof body.result === 'number') {
    return { connected: true, uid: body.result }
  }

  return { connected: false, error: `Unexpected response from Odoo: ${JSON.stringify(body)}` }
}

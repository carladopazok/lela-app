import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const TOKEN_FILE = path.join(DATA_DIR, 'instagram-tokens.json')
const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`

// This is Meta's newer "Instagram API with Instagram Login" product — a standalone flow with
// no Facebook Page or Facebook Login involved (confirmed against a real test token: /me returns
// the IG account directly, and graph.instagram.com/{ig_user_id}/conversations works with no Page
// in the picture at all). This is a different product from the Facebook-Login/Pages-based
// "Instagram Graph API" that older guides (and an earlier version of this file) describe.
interface IGTokens {
  access_token: string // long-lived Instagram User access token
  ig_user_id: string    // Instagram-scoped user id, from the `user_id` field of the code exchange
  expires_at: number    // long-lived tokens last ~60 days; refreshed proactively before then
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function readTokens(): IGTokens | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null
    return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')) as IGTokens
  } catch {
    return null
  }
}

function writeTokens(tokens: IGTokens) {
  ensureDataDir()
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2))
}

export function hasIGAuth(): boolean {
  return existsSync(TOKEN_FILE)
}

async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
  const url = new URL('https://graph.instagram.com/access_token')
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', process.env.IG_APP_SECRET!)
  url.searchParams.set('access_token', shortLivedToken)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Instagram long-lived token exchange failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

async function refreshLongLivedToken(currentToken: string): Promise<{ access_token: string; expires_in: number }> {
  const url = new URL('https://graph.instagram.com/refresh_access_token')
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', currentToken)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Instagram token refresh failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

// Called from the OAuth callback with the result of the code-for-token exchange (POST
// api.instagram.com/oauth/access_token, done in the callback route itself — same division of
// labor as ms-graph.ts's saveMSTokens). Exchanges the short-lived token for a long-lived one and
// persists it alongside the ig_user_id the code exchange already gave us — no separate Facebook
// Page/Business Account lookup needed in this flow.
export async function saveIGTokens(data: { access_token: string; user_id: string }): Promise<void> {
  const longLived = await exchangeForLongLivedToken(data.access_token)
  writeTokens({
    access_token: longLived.access_token,
    ig_user_id: String(data.user_id),
    expires_at: Date.now() + (longLived.expires_in - 60) * 1000,
  })
}

const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000 // refresh proactively when within 7 days of expiry

async function getTokens(): Promise<IGTokens> {
  let tokens = readTokens()
  if (!tokens) throw new Error('Instagram not connected')
  if (Date.now() >= tokens.expires_at - REFRESH_MARGIN_MS) {
    const refreshed = await refreshLongLivedToken(tokens.access_token)
    tokens = { ...tokens, access_token: refreshed.access_token, expires_at: Date.now() + (refreshed.expires_in - 60) * 1000 }
    writeTokens(tokens)
  }
  return tokens
}

export async function getAccessToken(): Promise<string> {
  return (await getTokens()).access_token
}

export async function getIgUserId(): Promise<string> {
  return (await getTokens()).ig_user_id
}

export interface IGConversation {
  id: string
  participants?: { data: Array<{ id: string; username?: string }> }
  updated_time: string
}

export interface IGMessage {
  id: string
  from: { id: string; username?: string }
  to?: { data: Array<{ id: string; username?: string }> }
  message?: string
  created_time: string
}

export async function fetchConversations(limit = 50): Promise<IGConversation[]> {
  const [token, igUserId] = await Promise.all([getAccessToken(), getIgUserId()])
  const url = new URL(`${GRAPH_BASE}/${igUserId}/conversations`)
  url.searchParams.set('fields', 'participants,updated_time')
  url.searchParams.set('limit', String(limit))

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Instagram conversations fetch failed: ${await res.text()}`)
  const data = await res.json() as { data: IGConversation[] }
  return data.data
}

export async function fetchConversationMessages(conversationId: string): Promise<IGMessage[]> {
  const token = await getAccessToken()
  const url = new URL(`${GRAPH_BASE}/${conversationId}/messages`)
  url.searchParams.set('fields', 'id,from,to,message,created_time')

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Instagram messages fetch failed: ${await res.text()}`)
  const data = await res.json() as { data: IGMessage[] }
  return data.data
}

const OUTSIDE_WINDOW_ERROR = "Can't send — outside Instagram's 24-hour reply window"

export async function sendMessage(igsid: string, body: string): Promise<{ message_id: string }> {
  const [token, igUserId] = await Promise.all([getAccessToken(), getIgUserId()])
  const res = await fetch(`${GRAPH_BASE}/${igUserId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: igsid },
      message: { text: body },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    // Meta returns error code 10 / subcode 2018278 for messages sent outside the 24h window.
    if (text.includes('2018278') || /outside.*window/i.test(text)) {
      throw new Error(OUTSIDE_WINDOW_ERROR)
    }
    throw new Error(`Instagram send failed: ${text}`)
  }
  return res.json() as Promise<{ message_id: string }>
}

// Instagram's Graph API has no endpoint to delete a sent DM — unlike Outlook, ticket deletion
// for this channel is local-only (see src/app/api/cs/tickets/[id]/route.ts).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const TOKEN_FILE = path.join(DATA_DIR, 'ms-tokens.json')

interface MSTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function readTokens(): MSTokens | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null
    return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')) as MSTokens
  } catch {
    return null
  }
}

function writeTokens(tokens: MSTokens) {
  ensureDataDir()
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2))
}

async function refreshTokens(refreshToken: string): Promise<MSTokens> {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID!,
        client_secret: process.env.MS_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'Mail.ReadWrite Mail.Send offline_access',
      }),
    }
  )
  if (!res.ok) throw new Error(`MS token refresh failed: ${await res.text()}`)
  const d = await res.json() as { access_token: string; refresh_token?: string; expires_in: number }
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token ?? refreshToken,
    expires_at: Date.now() + (d.expires_in - 60) * 1000,
  }
}

export function hasMSAuth(): boolean {
  return existsSync(TOKEN_FILE)
}

export function saveMSTokens(data: { access_token: string; refresh_token: string; expires_in: number }) {
  ensureDataDir()
  writeTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  })
}

export async function getAccessToken(): Promise<string> {
  let tokens = readTokens()
  if (!tokens) throw new Error('Outlook not connected')
  if (Date.now() >= tokens.expires_at) {
    tokens = await refreshTokens(tokens.refresh_token)
    writeTokens(tokens)
  }
  return tokens.access_token
}

export interface GraphMessage {
  id: string
  subject: string | null
  receivedDateTime: string
  from: { emailAddress: { name: string; address: string } }
  replyTo?: Array<{ emailAddress: { name: string; address: string } }>
  body: { contentType: string; content: string }
  conversationId: string
}

export async function fetchInboxMessages(top = 50): Promise<GraphMessage[]> {
  const token = await getAccessToken()
  const url = new URL('https://graph.microsoft.com/v1.0/me/messages')
  url.searchParams.set('$top', String(top))
  url.searchParams.set('$orderby', 'receivedDateTime desc')
  url.searchParams.set('$select', 'id,subject,receivedDateTime,from,replyTo,body,conversationId')
  url.searchParams.set('$filter', "isDraft eq false and isRead eq false or isRead eq true")

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Prefer': 'outlook.body-content-type="text"',
    },
  })
  if (!res.ok) throw new Error(`Graph fetch failed: ${await res.text()}`)
  const data = await res.json() as { value: GraphMessage[] }
  return data.value
}

export async function replyToMessage(messageId: string, body: string): Promise<void> {
  const token = await getAccessToken()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}/reply`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment: body }),
    }
  )
  if (!res.ok) throw new Error(`Graph reply failed: ${await res.text()}`)
}

export async function deleteMessage(messageId: string): Promise<void> {
  const token = await getAccessToken()
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) throw new Error(`Graph delete failed: ${await res.text()}`)
}

export async function sendNewEmail(to: string, subject: string, body: string): Promise<void> {
  const token = await getAccessToken()
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  })
  if (!res.ok) throw new Error(`Graph sendMail failed: ${await res.text()}`)
}

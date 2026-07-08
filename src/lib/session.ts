import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'lela_session'
const ALGORITHM = 'aes-256-gcm'

export interface Session {
  shop: string
  accessToken: string
}

function deriveKey(): Buffer {
  const secret = process.env.APP_SECRET
  if (!secret) throw new Error('APP_SECRET env variable is missing')
  return scryptSync(secret, 'lela-v1', 32)
}

function encrypt(text: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join('.')
}

function decrypt(text: string): string {
  const parts = text.split('.')
  if (parts.length !== 3) throw new Error('Malformed session cookie')
  const [ivHex, tagHex, encHex] = parts
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

/**
 * Returns an active session, checking in order:
 * 1. OAuth cookie set by the install flow
 * 2. SHOPIFY_ACCESS_TOKEN + SHOPIFY_STORE_DOMAIN env vars (direct token — no OAuth needed)
 */
export function getSession(): Session | null {
  // 1 — OAuth cookie
  try {
    const cookieStore = cookies()
    const raw = cookieStore.get(COOKIE_NAME)?.value
    if (raw) return JSON.parse(decrypt(raw)) as Session
  } catch { /* fall through */ }

  // 2 — Direct env token (Custom App or manually obtained token)
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
  const shop = process.env.SHOPIFY_STORE_DOMAIN
  if (accessToken && shop) return { shop, accessToken }

  return null
}

/** Encrypt a session object, returning the value to pass to Set-Cookie. */
export function encryptSession(session: Session): string {
  return encrypt(JSON.stringify(session))
}


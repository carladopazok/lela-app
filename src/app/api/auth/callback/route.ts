import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { encryptSession } from '@/lib/session'

const COOKIE_NAME = 'lela_session'

function verifyShopifyHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get('hmac')
  if (!hmac) return false

  const message = Array.from(params.entries())
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const computed = createHmac('sha256', secret).update(message).digest('hex')
  return computed === hmac
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const shop = params.get('shop')
  const code = params.get('code')
  const state = params.get('state')

  if (!shop || !code || !state) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  // Verify CSRF state
  const stateCookie = req.cookies.get('lela_oauth_state')?.value
  if (!stateCookie || stateCookie !== state) {
    return NextResponse.json({ error: 'Invalid state — possible CSRF attack' }, { status: 403 })
  }

  // Verify Shopify HMAC signature
  if (!verifyShopifyHmac(params, process.env.SHOPIFY_CLIENT_SECRET!)) {
    return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 403 })
  }

  // Exchange authorization code for a permanent offline access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    return NextResponse.json({ error: `Shopify token exchange failed: ${body}` }, { status: 500 })
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string }

  // Store encrypted session in a long-lived cookie and redirect to the app
  const appUrl = process.env.APP_URL!
  const res = NextResponse.redirect(new URL('/', appUrl))

  res.cookies.set(COOKIE_NAME, encryptSession({ shop, accessToken: access_token }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  // Clean up the state nonce cookie
  res.cookies.delete('lela_oauth_state')

  return res
}

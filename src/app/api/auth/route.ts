import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

// Scopes needed for all dashboard features
const SCOPES = 'read_orders,read_all_orders,read_customers,write_customers,read_products,write_products,read_inventory,read_returns,write_discounts'

export async function GET() {
  const shop = process.env.SHOPIFY_STORE_DOMAIN!
  const clientId = process.env.SHOPIFY_CLIENT_ID!
  const appUrl = process.env.APP_URL!
  const redirectUri = `${appUrl}/api/auth/callback`

  const state = randomBytes(16).toString('hex')

  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(authUrl.toString())

  // State nonce stored in a short-lived cookie for CSRF verification on callback
  res.cookies.set('lela_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return res
}

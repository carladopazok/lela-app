import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function GET() {
  const state = randomBytes(16).toString('hex')
  const redirectUri = `${process.env.APP_URL}/api/ms/auth/callback`

  const authUrl = new URL(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/authorize`
  )
  authUrl.searchParams.set('client_id', process.env.MS_CLIENT_ID!)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', 'Mail.ReadWrite Mail.Send offline_access')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('response_mode', 'query')

  const res = NextResponse.redirect(authUrl.toString())
  res.cookies.set('ms_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}

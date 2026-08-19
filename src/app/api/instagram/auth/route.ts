import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function GET() {
  const state = randomBytes(16).toString('hex')
  const redirectUri = `${process.env.APP_URL}/api/instagram/auth/callback`

  // "Instagram API with Instagram Login" — a standalone flow with no Facebook Page/Login
  // involved, confirmed against this app's actual dashboard ("Welcome to Instagram API" /
  // Instagram App ID+Secret, not the Settings → Basic Facebook App ID).
  const authUrl = new URL('https://www.instagram.com/oauth/authorize')
  authUrl.searchParams.set('client_id', process.env.IG_APP_ID!)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'instagram_business_basic,instagram_business_manage_messages')
  authUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(authUrl.toString())
  res.cookies.set('ig_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}

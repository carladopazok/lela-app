import { NextRequest, NextResponse } from 'next/server'
import { saveIGTokens } from '@/lib/instagram-graph'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')

  if (error) {
    return NextResponse.json({ error: params.get('error_description') ?? error }, { status: 400 })
  }

  const stateCookie = req.cookies.get('ig_oauth_state')?.value
  if (!stateCookie || stateCookie !== state) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 403 })
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.IG_APP_ID!,
      client_secret: process.env.IG_APP_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.APP_URL}/api/instagram/auth/callback`,
      code,
    }),
  })
  if (!tokenRes.ok) {
    return NextResponse.json({ error: `Token exchange failed: ${await tokenRes.text()}` }, { status: 500 })
  }

  const tokenData = await tokenRes.json() as { access_token: string; user_id: string }

  try {
    await saveIGTokens(tokenData)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save Instagram tokens' }, { status: 500 })
  }

  const res = NextResponse.redirect(new URL('/', process.env.APP_URL!))
  res.cookies.delete('ig_oauth_state')
  return res
}

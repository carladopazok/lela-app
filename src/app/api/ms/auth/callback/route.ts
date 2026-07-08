import { NextRequest, NextResponse } from 'next/server'
import { saveMSTokens } from '@/lib/ms-graph'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')

  if (error) {
    return NextResponse.json({ error: params.get('error_description') ?? error }, { status: 400 })
  }

  const stateCookie = req.cookies.get('ms_oauth_state')?.value
  if (!stateCookie || stateCookie !== state) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 403 })
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID!,
        client_secret: process.env.MS_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.APP_URL}/api/ms/auth/callback`,
        scope: 'Mail.Read Mail.Send offline_access',
      }),
    }
  )

  if (!tokenRes.ok) {
    return NextResponse.json({ error: `Token exchange failed: ${await tokenRes.text()}` }, { status: 500 })
  }

  const tokenData = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  saveMSTokens(tokenData)

  const res = NextResponse.redirect(new URL('/', process.env.APP_URL!))
  res.cookies.delete('ms_oauth_state')
  return res
}

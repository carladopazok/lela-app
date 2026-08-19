import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { hasIGAuth } from '@/lib/instagram-graph'

export async function GET() {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  if (hasIGAuth()) {
    return NextResponse.json({ connected: true, detail: 'Powers the Instagram tab in Customer Service.' })
  }

  // Not a missing-credentials case — IG_APP_ID/IG_APP_SECRET can be set and the OAuth flow,
  // scopes, and messaging API calls are fully implemented and verified against the real Meta
  // app (including a live test against graph.instagram.com). What's actually missing locally
  // is an HTTPS callback URL: Meta's Instagram Login requires one for the one-time "Connect"
  // step, and local dev only serves plain HTTP — see the "Instagram DM" section in CLAUDE.md.
  // Once deployed somewhere with a real HTTPS domain that blocker goes away, so show simpler
  // "coming soon" copy there instead of an explanation that would no longer apply.
  const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.APP_URL ?? '')

  return NextResponse.json({
    connected: false,
    error: isLocalDev
      ? 'Not connected yet — blocked on an HTTPS callback URL for the one-time OAuth connect step (Meta requires HTTPS; local dev is plain HTTP). Code is otherwise complete. See CLAUDE.md.'
      : 'Coming soon — Instagram DM support is built but not yet connected.',
  })
}

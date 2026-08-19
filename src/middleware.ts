import { NextRequest, NextResponse } from 'next/server'

// Duplicated here to avoid importing session.ts (which uses next/headers, not available in Edge)
const SESSION_COOKIE = 'lela_session'

// Paths that don't require an active session
// /api/public is called cross-origin, unauthenticated, by the storefront theme (see
// src/app/api/public/back-in-stock/route.ts) — it must stay open to anonymous visitors.
const PUBLIC_PREFIXES = ['/api/auth', '/api/ms/auth', '/api/instagram/auth', '/api/public', '/install', '/_next', '/favicon.ico']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Authenticated if either an OAuth cookie exists OR a direct env token is configured
  const hasEnvToken = !!(process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_STORE_DOMAIN)
  const hasSession = req.cookies.has(SESSION_COOKIE) || hasEnvToken

  if (!hasSession) {
    // API routes → return 401 so client-side error handling can catch it
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    // Pages → redirect to the install flow
    return NextResponse.redirect(new URL('/install', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

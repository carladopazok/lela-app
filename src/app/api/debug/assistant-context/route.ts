import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { buildAssistantContext } from '@/lib/assistant-context'

// Temporary diagnostic — returns the raw digest Helper's prompt is grounded in, without
// spending an Ollama call, so a wrong answer can be traced to bad data vs. model reasoning.
// Same session-gated pattern as /api/debug/shopify.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'No session — go to /install first' }, { status: 401 })

  const question = req.nextUrl.searchParams.get('q') || 'stalled inventory'
  const shopify = createShopifyClient(session)

  try {
    const context = await buildAssistantContext(shopify, question)
    return NextResponse.json({ question, context })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

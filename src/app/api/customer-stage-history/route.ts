import { NextResponse } from 'next/server'
import { readStageHistory } from '@/lib/stage-storage'
import { matchFlowForTransition } from '@/lib/email-performance-demo'

// Local-file read only (no Shopify/Omnisend call), same idiom as
// /api/omnisend/contacts-count — no session gate needed. Read by both
// EmailStageAttribution.tsx and CustomerJourney.tsx's attribution card, so
// the flow-matching logic lives in one place (email-performance-demo.ts)
// instead of being duplicated client-side.
export async function GET() {
  try {
    const history = readStageHistory()
    const transitions = history
      .map((t) => ({ ...t, matchedFlow: matchFlowForTransition(t.oldStage, t.newStage) }))
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    return NextResponse.json({ transitions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

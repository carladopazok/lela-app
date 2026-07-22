import { NextResponse } from 'next/server'
import { omnisendListAutomations } from '@/lib/omnisend'

export interface AutomationSummary {
  id: string
  name: string
  isEnabled: boolean
}

// Deliberately separate from /api/omnisend/analytics/flows — that route also calls
// the Analytics API (its own, separate rate limit) to get performance numbers. This
// one only needs real id + name, to resolve a Journey automation card's "View" link
// to the exact Omnisend workflow, so it skips the analytics call entirely.
export async function GET() {
  try {
    const automations = await omnisendListAutomations()
    const summaries: AutomationSummary[] = automations.map((a) => ({ id: a.id, name: a.name, isEnabled: a.isEnabled }))
    return NextResponse.json({ automations: summaries })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

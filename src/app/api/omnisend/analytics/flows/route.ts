import { NextResponse } from 'next/server'
import {
  omnisendAnalyticsReport,
  omnisendListAutomations,
  MARKETING_ACTIVITY_ID_DIMENSION,
  MARKETING_ACTIVITY_TYPE_FILTER,
  type OmnisendAutomationBlock,
} from '@/lib/omnisend'

export interface RealFlowStep {
  subject: string
  delayLabel: string
}

export interface RealFlowRow {
  id: string
  name: string
  isEnabled: boolean
  sent: number
  openRate: number | null
  clickRate: number | null
  placedOrderRate: number | null
  revenue: number | null
  bounceRate: number | null
  complaintRate: number | null
  unsubscribeRate: number | null
  steps: RealFlowStep[]
}

export interface FlowsResponse {
  flows: RealFlowRow[]
  // Set when automation structure loaded fine but the analytics report call
  // failed (e.g. the Analytics API's own rate limit, separate from the rest
  // of Omnisend's API) — flows still render with real names/steps, just with
  // null stats, instead of the whole request failing.
  analyticsError?: string
}

const UNIT_LABEL: Record<string, string> = { d: 'day', h: 'hour', m: 'minute' }

function delayLabel(block: OmnisendAutomationBlock | undefined): string {
  if (!block || block.type !== 'delay' || !block.delay) return 'Immediately'
  const { amount, units } = block.delay.duration
  const unit = UNIT_LABEL[units] ?? units
  return `${amount} ${unit}${amount === 1 ? '' : 's'} later`
}

// Pairs each sendEmail action block with the delay block immediately before
// it (Omnisend represents a flow as a flat block list, delay/action
// alternating), to produce a real, timing-labeled step list.
function extractSteps(blocks: OmnisendAutomationBlock[]): RealFlowStep[] {
  const steps: RealFlowStep[] = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.type === 'action' && block.action?.type === 'sendEmail' && block.action.sendEmail) {
      const prev = blocks[i - 1]
      steps.push({ subject: block.action.sendEmail.subject, delayLabel: delayLabel(prev) })
    }
  }
  return steps
}

export async function GET() {
  let automations
  try {
    automations = await omnisendListAutomations()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Independent of the automations fetch above — the Analytics API has its
  // own rate limit, separate from the rest of Omnisend's API, so a 429 here
  // shouldn't take down the whole response when we already have real
  // structure (name, steps, subject lines) to show.
  let rowsByActivityId = new Map<string, Record<string, string | number>>()
  let analyticsError: string | undefined
  try {
    const [report] = await omnisendAnalyticsReport([
      {
        alias: 'flows',
        metrics: [
          { name: 'sent' },
          { name: 'openRate' },
          { name: 'clickRate' },
          { name: 'attributedOrderRate' },
          { name: 'attributedRevenue' },
          { name: 'failRate' },
          { name: 'markedAsSpamRate' },
          { name: 'unsubscribeRate' },
        ],
        dateRange: { interval: 'last90Days' },
        dimensions: [{ name: MARKETING_ACTIVITY_ID_DIMENSION }],
        filters: [{ name: MARKETING_ACTIVITY_TYPE_FILTER, operator: 'in', values: ['Automation'] }],
      },
    ])
    for (const row of report?.rows ?? []) {
      const id = row[MARKETING_ACTIVITY_ID_DIMENSION]
      if (id != null) rowsByActivityId.set(String(id), row)
    }
  } catch (err) {
    analyticsError = err instanceof Error ? err.message : 'Unknown error'
  }

  const flows: RealFlowRow[] = automations
    .filter((a) => a.isEnabled)
    .map((a) => {
      const row = rowsByActivityId.get(a.id)
      return {
        id: a.id,
        name: a.name,
        isEnabled: a.isEnabled,
        sent: row ? Number(row.sent) || 0 : 0,
        openRate: row ? Number(row.openRate) : null,
        clickRate: row ? Number(row.clickRate) : null,
        placedOrderRate: row ? Number(row.attributedOrderRate) : null,
        revenue: row ? Number(row.attributedRevenue) : null,
        bounceRate: row ? Number(row.failRate) : null,
        complaintRate: row ? Number(row.markedAsSpamRate) : null,
        unsubscribeRate: row ? Number(row.unsubscribeRate) : null,
        steps: extractSteps(a.blocks),
      }
    })

  const body: FlowsResponse = analyticsError ? { flows, analyticsError } : { flows }
  return NextResponse.json(body)
}

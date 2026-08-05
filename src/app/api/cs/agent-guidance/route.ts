import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { readAgentGuidance, writeAgentGuidance } from '@/lib/cs-storage'
import type { AgentGuidance } from '@/types'

export async function GET() {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json(readAgentGuidance())
}

export async function PUT(req: NextRequest) {
  if (!getSession()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json() as Partial<AgentGuidance>
  if (
    typeof body.agentName !== 'string' ||
    typeof body.toneOfVoice !== 'string' ||
    typeof body.standardMessage !== 'string' ||
    !Array.isArray(body.notes)
  ) {
    return NextResponse.json({ error: 'agentName, toneOfVoice, standardMessage (strings) and notes (array) are required' }, { status: 400 })
  }

  const guidance: AgentGuidance = {
    agentName: body.agentName,
    toneOfVoice: body.toneOfVoice,
    standardMessage: body.standardMessage,
    notes: body.notes,
  }
  writeAgentGuidance(guidance)
  return NextResponse.json(guidance)
}

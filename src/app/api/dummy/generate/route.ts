import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { generateDummyData } from '@/lib/dummy-data-generator'

export async function POST() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const summary = await generateDummyData(session)
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

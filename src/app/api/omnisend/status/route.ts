import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { checkOmnisendConnection } from '@/lib/omnisend'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const result = await checkOmnisendConnection()
  return NextResponse.json(result)
}

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { checkShopifyConnection } from '@/lib/shopify'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const result = await checkShopifyConnection(session)
  return NextResponse.json(result)
}

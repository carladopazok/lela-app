import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { checkOdooConnection } from '@/lib/odoo'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const result = await checkOdooConnection()
  return NextResponse.json(result)
}

import { NextResponse } from 'next/server'
import { countOmnisendContacts } from '@/lib/omnisend'

export async function GET() {
  try {
    const total = await countOmnisendContacts()
    return NextResponse.json({ total })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

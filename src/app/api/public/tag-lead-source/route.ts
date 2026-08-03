import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { tagLeadSource } from '@/lib/lead-source'
import { SOURCE_VALUES, type SourceValue } from '@/lib/tag-sync'
import type { ShopifyCustomer } from '@/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Called cross-origin, unauthenticated, by the four external lead-capture
// touchpoints (popup, event signup page, giveaway landing page, referral handler —
// none of which live in this repo). Bypasses session auth via the /api/public
// prefix in src/middleware.ts, same as /api/public/back-in-stock. This is the one
// shared entry point all four call — see src/lib/lead-source.ts for why.
function corsHeaders(): Record<string, string> {
  const origin = process.env.STOREFRONT_ORIGIN
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const source = typeof body.source === 'string' ? body.source : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const customerId = body.customerId != null ? String(body.customerId) : ''

    if (!SOURCE_VALUES.includes(source as SourceValue) || (!customerId && !EMAIL_RE.test(email))) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: corsHeaders() })
    }

    const session = getSession()
    if (!session) return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders() })
    const shopify = createShopifyClient(session)

    let customer: ShopifyCustomer | undefined
    if (customerId) {
      const data = await shopify.get<{ customer: ShopifyCustomer }>(`/customers/${customerId}.json`)
      customer = data.customer
    } else {
      const data = await shopify.get<{ customers: ShopifyCustomer[] }>('/customers/search.json', { query: `email:${email}` })
      customer = data.customers?.[0]
    }

    if (!customer) return NextResponse.json({ error: 'Customer not found in Shopify' }, { status: 404, headers: corsHeaders() })

    const result = await tagLeadSource(shopify, customer, source as SourceValue)

    return NextResponse.json({ ok: true, alreadySet: result.alreadySet }, { headers: corsHeaders() })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: corsHeaders() })
  }
}

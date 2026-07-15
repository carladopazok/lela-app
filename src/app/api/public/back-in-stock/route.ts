import { NextRequest, NextResponse } from 'next/server'
import { addBackInStockSignup } from '@/lib/back-in-stock-storage'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Called cross-origin, unauthenticated, from the live storefront theme (see
// theme-snippets/back-in-stock.liquid) — bypasses session auth via the /api/public
// prefix in src/middleware.ts. Deliberately minimal: validate + record the signup only.
// Omnisend sync happens later, staff-triggered, from the Products & Inventory "Create
// Segment" action (src/app/api/shopify/products/[id]/back-in-stock-segment/route.ts) —
// keeping this public surface as small as possible.
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
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const productId = body.productId != null ? String(body.productId) : ''
    const variantId = Number(body.variantId)
    const variantTitle = typeof body.variantTitle === 'string' ? body.variantTitle : null

    if (!productId || !Number.isFinite(variantId) || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: corsHeaders() })
    }

    addBackInStockSignup(productId, { email, variantId, variantTitle })

    return NextResponse.json({ ok: true }, { headers: corsHeaders() })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: corsHeaders() })
  }
}

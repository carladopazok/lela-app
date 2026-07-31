import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { createProductDiscountCode, markdownProductVariants } from '@/lib/shopify-discounts'

interface RouteParams {
  params: { id: string }
}

function slugifyCode(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '')
}

// Creates a real, live Shopify discount code for this one product (store-wide — any
// customer can use the code) and optionally also marks down the product's live price.
// Requires the write_discounts scope (see CLAUDE.md Auth section).
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { percentage, name, markdown }: { percentage: unknown; name: unknown; markdown: unknown } = await req.json()

    if (typeof percentage !== 'number' || !(percentage > 0 && percentage <= 0.95)) {
      return NextResponse.json({ error: 'percentage must be a number between 0 (exclusive) and 0.95' }, { status: 400 })
    }
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const code = slugifyCode(name)
    if (!code) {
      return NextResponse.json({ error: 'name must contain at least one letter or number' }, { status: 400 })
    }

    const shopify = createShopifyClient(session)
    const { code: discountCode } = await createProductDiscountCode(shopify, {
      productId: params.id,
      title: name.trim(),
      code,
      percentage,
    })

    let variantsUpdated = 0
    if (markdown === true) {
      const result = await markdownProductVariants(shopify, params.id, percentage)
      variantsUpdated = result.variantsUpdated
    }

    return NextResponse.json({ discountCode, markdownApplied: markdown === true, variantsUpdated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

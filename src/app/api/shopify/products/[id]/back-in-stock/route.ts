import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { readBackInStockSignups } from '@/lib/back-in-stock-storage'
import type { ShopifyProduct, BackInStockResponse, BackInStockVariantStatus } from '@/types'

interface RouteParams {
  params: { id: string }
}

// Lazy-loaded on row expand, same pattern as interested-customers/route.ts — not bundled
// into the main catalog payload since it's only needed for products with a sold-out variant.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const productId = params.id
    const shopify = createShopifyClient(session)

    const { product } = await shopify.get<{ product: ShopifyProduct }>(`/products/${productId}.json`, {
      fields: 'id,variants',
    })

    const signups = readBackInStockSignups(productId)
    const signupsByVariant = new Map<number, typeof signups>()
    for (const s of signups) {
      const list = signupsByVariant.get(s.variantId) ?? []
      list.push(s)
      signupsByVariant.set(s.variantId, list)
    }

    const variants: BackInStockVariantStatus[] = (product.variants ?? []).map((v) => ({
      variantId: v.id,
      variantTitle: v.title,
      inventoryQuantity: v.inventory_quantity,
      signups: signupsByVariant.get(v.id) ?? [],
    }))

    const response: BackInStockResponse = { productId, variants }
    return NextResponse.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

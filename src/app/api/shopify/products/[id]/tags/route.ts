import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { TOGGLEABLE_PRODUCT_TAGS, toggleProductTag, type ToggleableProductTag } from '@/lib/product-tags'

interface RouteParams {
  params: { id: string }
}

function isToggleableTag(tag: unknown): tag is ToggleableProductTag {
  return typeof tag === 'string' && (TOGGLEABLE_PRODUCT_TAGS as readonly string[]).includes(tag)
}

// Shared toggle for the two Stockout Actions product tags (lela-low-stock, lela-restock-early).
// Whitelisted against TOGGLEABLE_PRODUCT_TAGS so this can't be used to toggle an arbitrary tag.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { tag, enabled }: { tag: unknown; enabled: unknown } = await req.json()
    if (!isToggleableTag(tag)) {
      return NextResponse.json({ error: `tag must be one of: ${TOGGLEABLE_PRODUCT_TAGS.join(', ')}` }, { status: 400 })
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    const shopify = createShopifyClient(session)
    const tags = await toggleProductTag(shopify, params.id, tag, enabled)

    return NextResponse.json({ tags })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

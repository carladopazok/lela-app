import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'

function resizedImageUrl(src: string): string {
  return src.replace(/(\.(jpe?g|png|gif|webp))(\?.*)?$/i, '_100x100$1$3')
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)

    const orders = await shopify.getAll<Record<string, unknown>>('/orders.json', 'orders', {
      customer_id: params.id,
      status: 'any',
      created_at_min: '2020-01-01T00:00:00.000Z',
    })

    // Collect unique product IDs
    const productIds = [
      ...new Set(
        orders.flatMap((o) =>
          ((o.line_items as Array<{ product_id: number | null }>) ?? [])
            .map((li) => li.product_id)
            .filter((id): id is number => id != null)
        )
      ),
    ]

    // Attempt to batch-fetch product images + tags — fails gracefully if read_products scope is missing
    const imageMap = new Map<number, string>()
    const tagsMap = new Map<number, string[]>()
    if (productIds.length > 0) {
      try {
        const data = await shopify.get<{ products: Array<{ id: number; image: { src: string } | null; tags: string }> }>(
          '/products.json',
          { ids: productIds.join(','), fields: 'id,image,tags' }
        )
        for (const p of data.products ?? []) {
          if (p.image?.src) imageMap.set(p.id, resizedImageUrl(p.image.src))
          const tags = (p.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
          if (tags.length > 0) tagsMap.set(p.id, tags)
        }
      } catch {
        // read_products scope not granted — orders still returned, images/tags just won't appear
      }
    }

    // Attach image_url + tags to each line item
    const enriched = orders.map((o) => ({
      ...o,
      line_items: ((o.line_items as Array<Record<string, unknown>>) ?? []).map((li) => ({
        ...li,
        image_url: li.product_id ? (imageMap.get(li.product_id as number) ?? null) : null,
        tags: li.product_id ? (tagsMap.get(li.product_id as number) ?? []) : [],
      })),
    }))

    return NextResponse.json({ orders: enriched, shop: session.shop })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { readRelatedProducts, writeRelatedProducts } from '@/lib/related-products-storage'
import { computeSameTag, computeFrequentlyBoughtTogether, mergeRelations } from '@/lib/related-products'
import type { ShopifyOrder, RelatedProductEntry } from '@/types'

const DEFAULT_MIN_SHARED_ORDERS = 3

// A tag on most of the catalog ("sale", "new", "bestseller") isn't a meaningful cross-sell
// signal — it would make every product "related" to every other product, the same trap the
// old collection-based version fell into with a catalog-wide "Home page" collection. Any tag
// covering more than this share of the catalog is skipped.
const MAX_TAG_CATALOG_SHARE = 0.5

export async function GET() {
  return NextResponse.json(readRelatedProducts())
}

// Manual "Recompute" trigger — no cron/worker in this app, so relations are cached to
// data/related-products.json and only refreshed when this is called (see CLAUDE.md: JSON
// files + manual refresh is the established persistence pattern here).
export async function POST(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const minSharedOrders = Number.isFinite(body.minSharedOrders) ? body.minSharedOrders : DEFAULT_MIN_SHARED_ORDERS

    const shopify = createShopifyClient(session)

    // Frequently-bought-together needs full order history to reach the co-purchase
    // threshold reliably — not the 365-day window used elsewhere in this app for
    // recency stats. Same "since the beginning" pattern already used for per-customer
    // order history (src/app/api/shopify/customers/[id]/orders/route.ts).
    const orders = await shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
      status: 'any',
      created_at_min: '2020-01-01T00:00:00.000Z',
      fields: 'id,line_items',
    })
    const fbtRelations = computeFrequentlyBoughtTogether(orders, minSharedOrders)

    // Same-tag relations are best-effort: requires read_products (may not be granted). If it
    // fails, frequently-bought-together relations (order-data only) still get saved below.
    let tagRelations = new Map<string, RelatedProductEntry[]>()
    try {
      const products = await shopify.getAll<{ id: number; tags: string }>('/products.json', 'products', {
        fields: 'id,tags',
      })
      const totalProducts = products.length

      const tagCounts = new Map<string, number>()
      const rawTagsByProductId = new Map<number, string[]>()
      for (const product of products) {
        const tags = (product.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
        rawTagsByProductId.set(product.id, tags)
        for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }

      const skippedTags: string[] = []
      const allowedTags = new Set<string>()
      for (const [tag, count] of tagCounts) {
        const share = totalProducts > 0 ? count / totalProducts : 0
        if (share > MAX_TAG_CATALOG_SHARE) skippedTags.push(`${tag} (${Math.round(share * 100)}%)`)
        else allowedTags.add(tag)
      }
      if (skippedTags.length > 0) {
        console.log(`[related-products] skipping catalog-wide tags (too broad to be a useful cross-sell signal): ${skippedTags.join(', ')}`)
      }

      const tagsByProductId = new Map<number, Set<string>>()
      for (const [productId, tags] of rawTagsByProductId) {
        const filtered = tags.filter((t) => allowedTags.has(t))
        if (filtered.length > 0) tagsByProductId.set(productId, new Set(filtered))
      }

      tagRelations = computeSameTag(tagsByProductId)
    } catch (err) {
      console.warn('[related-products] could not fetch product tags (likely missing read_products scope), same-tag relations unavailable:', err instanceof Error ? err.message : err)
    }

    const relations = mergeRelations(tagRelations, fbtRelations)
    const data = { computedAt: new Date().toISOString(), minSharedOrders, relations }
    writeRelatedProducts(data)

    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

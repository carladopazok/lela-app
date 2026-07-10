import type { ShopifyOrder, RelatedProductEntry, RelationType } from '@/types'

// Pure computation only — no I/O. Callers fetch Shopify data and persist the result.

/**
 * Groups product ids by shared Shopify product tags.
 * `tagsByProductId` maps a product id to the set of tags it carries — callers should already
 * have filtered out overly common tags (e.g. "sale", "new") before calling this, since a tag
 * on most of the catalog isn't a meaningful cross-sell signal.
 */
export function computeSameTag(
  tagsByProductId: Map<number, Set<string>>,
): Map<string, RelatedProductEntry[]> {
  const tagToProducts = new Map<string, Set<number>>()
  for (const [productId, tags] of tagsByProductId) {
    for (const tag of tags) {
      const set = tagToProducts.get(tag) ?? new Set<number>()
      set.add(productId)
      tagToProducts.set(tag, set)
    }
  }

  const relations = new Map<string, Set<string>>()
  for (const productIds of tagToProducts.values()) {
    for (const productId of productIds) {
      const others = relations.get(String(productId)) ?? new Set<string>()
      for (const otherId of productIds) {
        if (otherId !== productId) others.add(String(otherId))
      }
      relations.set(String(productId), others)
    }
  }

  const result = new Map<string, RelatedProductEntry[]>()
  for (const [productId, relatedIds] of relations) {
    result.set(
      productId,
      Array.from(relatedIds).map((relatedProductId) => ({
        relatedProductId,
        relationType: 'same-tag' as RelationType,
        coPurchaseCount: null,
      })),
    )
  }
  return result
}

/**
 * Counts, per pair of distinct products, how many distinct orders contained both.
 * Only pairs meeting `minSharedOrders` are returned, keyed by each product id in the pair.
 */
export function computeFrequentlyBoughtTogether(
  orders: ShopifyOrder[],
  minSharedOrders = 3,
): Map<string, RelatedProductEntry[]> {
  const pairCounts = new Map<string, number>() // key: "smallerId:largerId"

  for (const order of orders) {
    const productIds = [
      ...new Set((order.line_items ?? []).map((li) => li.product_id).filter((id): id is number => id != null)),
    ].sort((a, b) => a - b)

    for (let i = 0; i < productIds.length; i++) {
      for (let j = i + 1; j < productIds.length; j++) {
        const key = `${productIds[i]}:${productIds[j]}`
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
      }
    }
  }

  const relations = new Map<string, RelatedProductEntry[]>()
  for (const [key, count] of pairCounts) {
    if (count < minSharedOrders) continue
    const [aId, bId] = key.split(':')

    const aList = relations.get(aId) ?? []
    aList.push({ relatedProductId: bId, relationType: 'frequently-bought-together', coPurchaseCount: count })
    relations.set(aId, aList)

    const bList = relations.get(bId) ?? []
    bList.push({ relatedProductId: aId, relationType: 'frequently-bought-together', coPurchaseCount: count })
    relations.set(bId, bList)
  }

  return relations
}

/** Merges same-tag and frequently-bought-together maps into one relations record. */
export function mergeRelations(
  ...maps: Map<string, RelatedProductEntry[]>[]
): Record<string, RelatedProductEntry[]> {
  const merged: Record<string, RelatedProductEntry[]> = {}
  for (const map of maps) {
    for (const [productId, entries] of map) {
      merged[productId] = [...(merged[productId] ?? []), ...entries]
    }
  }
  return merged
}

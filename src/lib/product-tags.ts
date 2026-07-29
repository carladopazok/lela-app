import type { createShopifyClient } from './shopify'

export const LOW_STOCK_TAG = 'lela-low-stock'
export const RESTOCK_EARLY_TAG = 'lela-restock-early'
export const TOGGLEABLE_PRODUCT_TAGS = [LOW_STOCK_TAG, RESTOCK_EARLY_TAG] as const
export type ToggleableProductTag = (typeof TOGGLEABLE_PRODUCT_TAGS)[number]

// Shopify's tags PUT fully replaces the tag list, so this re-reads the product's current tags
// fresh immediately before writing, and only ever adds/strips the one requested tag — every
// other tag (vendor/category/other lela-* tags) is left untouched. Deliberately not
// tagsToShopifyTagString (src/lib/tagging.ts) — that helper strips ALL lela-* tags and is built
// for the customer-segmentation-tag system, not a single boolean product tag.
export async function toggleProductTag(
  shopify: ReturnType<typeof createShopifyClient>,
  productId: string | number,
  tag: ToggleableProductTag,
  enabled: boolean,
): Promise<string[]> {
  const current = await shopify.get<{ product: { tags: string } }>(`/products/${productId}.json`, { fields: 'tags' })
  const existing = (current.product.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const withoutTag = existing.filter((t) => t !== tag)
  const nextTags = enabled ? [...withoutTag, tag] : withoutTag

  await shopify.put(`/products/${productId}.json`, { product: { id: Number(productId), tags: nextTags.join(', ') } })

  return nextTags
}

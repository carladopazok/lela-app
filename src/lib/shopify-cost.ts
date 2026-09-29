import type { createShopifyClient } from '@/lib/shopify'

type Shopify = ReturnType<typeof createShopifyClient>

// Writes `cost` into Shopify's "Cost per item" (InventoryItem.cost) for every variant of a
// product — the same field the products route reads back as `nativeCogs`. Uses GraphQL
// productVariantsBulkUpdate (variant.inventoryItem.cost) so the whole product is one call.
// Shopify userErrors are thrown as-is so the UI shows the real reason (e.g. a missing scope).
export async function updateProductCostPerItem(
  shopify: Shopify,
  productId: string | number,
  cost: number,
): Promise<{ variantsUpdated: number }> {
  const gid = `gid://shopify/Product/${productId}`
  const data = await shopify.graphql<{
    product: { variants: { nodes: { id: string }[] } } | null
  }>(`query($id: ID!) { product(id: $id) { variants(first: 250) { nodes { id } } } }`, { id: gid })
  if (!data.product) throw new Error(`Product ${productId} not found on Shopify`)
  const variantIds = data.product.variants.nodes.map((v) => v.id)
  if (variantIds.length === 0) return { variantsUpdated: 0 }

  const result = await shopify.graphql<{
    productVariantsBulkUpdate: {
      productVariants: { id: string }[] | null
      userErrors: { field: string[] | null; message: string }[]
    }
  }>(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }`,
    {
      productId: gid,
      variants: variantIds.map((id) => ({ id, inventoryItem: { cost: cost.toFixed(2) } })),
    },
  )
  const { productVariants, userErrors } = result.productVariantsBulkUpdate
  if (userErrors.length > 0) {
    throw new Error(`Shopify rejected the cost update: ${userErrors.map((e) => e.message).join('; ')}`)
  }
  return { variantsUpdated: productVariants?.length ?? 0 }
}

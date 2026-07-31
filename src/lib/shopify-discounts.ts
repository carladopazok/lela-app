import type { createShopifyClient } from '@/lib/shopify'

type Shopify = ReturnType<typeof createShopifyClient>

interface UserError { field: string[] | null; message: string }

const DISCOUNT_CODE_CREATE = `
  mutation DiscountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`

interface DiscountCodeCreateResult {
  discountCodeBasicCreate: {
    codeDiscountNode: { id: string } | null
    userErrors: UserError[]
  }
}

// Store-wide discount code scoped to a single product — any customer can use the code,
// but it only ever discounts line items for this product.
export async function createProductDiscountCode(
  shopify: Shopify,
  { productId, title, code, percentage }: { productId: string | number; title: string; code: string; percentage: number },
): Promise<{ code: string }> {
  const data = await shopify.graphql<DiscountCodeCreateResult>(DISCOUNT_CODE_CREATE, {
    basicCodeDiscount: {
      title,
      code,
      startsAt: new Date().toISOString(),
      customerSelection: { all: true },
      customerGets: {
        value: { percentage },
        items: { products: { productsToAdd: [`gid://shopify/Product/${productId}`] } },
      },
      appliesOncePerCustomer: false,
    },
  })

  const userErrors = data.discountCodeBasicCreate.userErrors
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join('; '))
  }
  if (!data.discountCodeBasicCreate.codeDiscountNode) {
    throw new Error('Shopify accepted the request but did not create the discount')
  }

  return { code }
}

interface ShopifyVariant {
  id: number
  price: string
  compare_at_price: string | null
}

interface ShopifyProductVariantsResponse {
  product: { variants: ShopifyVariant[] }
}

// Marks down every variant's live price by `percentage`, backfilling compare_at_price from
// the variant's current price when none is already set — so the storefront shows a
// "was/now" strike-through instead of silently losing the pre-discount reference price.
export async function markdownProductVariants(
  shopify: Shopify,
  productId: string | number,
  percentage: number,
): Promise<{ variantsUpdated: number }> {
  const { product } = await shopify.get<ShopifyProductVariantsResponse>(`/products/${productId}.json`)
  const variants = product.variants ?? []

  const updated = variants.map((v) => {
    const currentPrice = parseFloat(v.price)
    const newPrice = Math.round(currentPrice * (1 - percentage) * 100) / 100
    return {
      id: v.id,
      price: newPrice.toFixed(2),
      compare_at_price: v.compare_at_price ?? v.price,
    }
  })

  await shopify.put(`/products/${productId}.json`, {
    product: { id: Number(productId), variants: updated },
  })

  return { variantsUpdated: updated.length }
}

import type { createShopifyClient } from '@/lib/shopify'

type Shopify = ReturnType<typeof createShopifyClient>

// Normalized view of one Shopify discount (code or automatic) for the Discounts tab and the
// product-page discount banner. Field names were checked against Shopify's Admin GraphQL docs
// for each discount type, not verified live (the session only exists in the browser cookie).
export interface DiscountSummary {
  id: string // DiscountNode gid, e.g. gid://shopify/DiscountCodeNode/123
  kind: string // GraphQL __typename, e.g. DiscountCodeBasic
  method: 'code' | 'automatic'
  title: string
  code: string | null // first redeem code (code discounts only)
  status: string // ACTIVE / SCHEDULED / EXPIRED
  startsAt: string | null
  endsAt: string | null
  summary: string | null
  usageCount: number // asyncUsageCount — Shopify updates it asynchronously, so it can lag slightly
  usageLimit: number | null // code discounts only; null = unlimited
  totalSales: { amount: number; currencyCode: string } | null // code discounts only
  percentage: number | null // 0–1, when the value is a percentage
  amount: { amount: number; currencyCode: string } | null // when the value is a fixed amount
  // What the discount applies to. Only 'all' and 'products' can drive a product-page banner;
  // collection-scoped, BXGY and free-shipping discounts are listed but never matched to a product.
  appliesTo: 'all' | 'products' | 'collections' | 'other'
  productIds: number[] // numeric Shopify product ids when appliesTo === 'products'
}

const CUSTOMER_GETS = `
  customerGets {
    value {
      __typename
      ... on DiscountPercentage { percentage }
      ... on DiscountAmount { amount { amount currencyCode } }
    }
    items {
      __typename
      ... on AllDiscountItems { allItems }
      ... on DiscountProducts {
        products(first: 250) { nodes { id } }
        productVariants(first: 250) { nodes { product { id } } }
      }
    }
  }
`

const CODE_FIELDS = `title status startsAt endsAt asyncUsageCount usageLimit totalSales { amount currencyCode } codes(first: 1) { nodes { code } }`
const AUTO_FIELDS = `title status startsAt endsAt asyncUsageCount`

// DiscountAutomaticFreeShipping may not exist in this app's API version (2024-10); an unknown
// fragment type fails the whole query, so it's included optionally and dropped on retry.
function discountFragments(includeAutoFreeShipping: boolean): string {
  return `
    __typename
    ... on DiscountCodeBasic { ${CODE_FIELDS} summary ${CUSTOMER_GETS} }
    ... on DiscountCodeBxgy { ${CODE_FIELDS} summary }
    ... on DiscountCodeFreeShipping { ${CODE_FIELDS} summary }
    ... on DiscountCodeApp { ${CODE_FIELDS} }
    ... on DiscountAutomaticBasic { ${AUTO_FIELDS} summary ${CUSTOMER_GETS} }
    ... on DiscountAutomaticBxgy { ${AUTO_FIELDS} summary }
    ... on DiscountAutomaticApp { ${AUTO_FIELDS} }
    ${includeAutoFreeShipping ? `... on DiscountAutomaticFreeShipping { ${AUTO_FIELDS} summary }` : ''}
  `
}

interface RawDiscount {
  __typename: string
  title?: string
  status?: string
  startsAt?: string | null
  endsAt?: string | null
  summary?: string | null
  asyncUsageCount?: number
  usageLimit?: number | null
  totalSales?: { amount: string; currencyCode: string } | null
  codes?: { nodes: { code: string }[] }
  customerGets?: {
    value: { __typename: string; percentage?: number; amount?: { amount: string; currencyCode: string } }
    items: {
      __typename: string
      allItems?: boolean
      products?: { nodes: { id: string }[] }
      productVariants?: { nodes: { product: { id: string } }[] }
    }
  }
}

function gidToNumber(gid: string): number {
  return Number(gid.split('/').pop())
}

function normalize(id: string, d: RawDiscount): DiscountSummary {
  const items = d.customerGets?.items
  const value = d.customerGets?.value
  let appliesTo: DiscountSummary['appliesTo'] = 'other'
  const productIds = new Set<number>()
  if (items?.__typename === 'AllDiscountItems') appliesTo = 'all'
  else if (items?.__typename === 'DiscountCollections') appliesTo = 'collections'
  else if (items?.__typename === 'DiscountProducts') {
    appliesTo = 'products'
    for (const p of items.products?.nodes ?? []) productIds.add(gidToNumber(p.id))
    for (const v of items.productVariants?.nodes ?? []) productIds.add(gidToNumber(v.product.id))
  }
  return {
    id,
    kind: d.__typename,
    method: d.__typename.startsWith('DiscountCode') ? 'code' : 'automatic',
    title: d.title ?? '(untitled discount)',
    code: d.codes?.nodes[0]?.code ?? null,
    status: d.status ?? 'UNKNOWN',
    startsAt: d.startsAt ?? null,
    endsAt: d.endsAt ?? null,
    summary: d.summary ?? null,
    usageCount: d.asyncUsageCount ?? 0,
    usageLimit: d.usageLimit ?? null,
    totalSales: d.totalSales ? { amount: parseFloat(d.totalSales.amount), currencyCode: d.totalSales.currencyCode } : null,
    percentage: value?.__typename === 'DiscountPercentage' ? value.percentage ?? null : null,
    amount: value?.__typename === 'DiscountAmount' && value.amount
      ? { amount: parseFloat(value.amount.amount), currencyCode: value.amount.currencyCode }
      : null,
    appliesTo,
    productIds: [...productIds],
  }
}

async function withFreeShippingFallback<T>(run: (includeAutoFreeShipping: boolean) => Promise<T>): Promise<T> {
  try {
    return await run(true)
  } catch (err) {
    if (err instanceof Error && err.message.includes('DiscountAutomaticFreeShipping')) return run(false)
    throw err
  }
}

// Every currently active discount (code + automatic), paginated. Requires read_discounts.
export async function listActiveDiscounts(shopify: Shopify): Promise<DiscountSummary[]> {
  return withFreeShippingFallback(async (includeAutoFreeShipping) => {
    const query = `
      query ActiveDiscounts($after: String) {
        discountNodes(first: 100, after: $after, query: "status:active") {
          pageInfo { hasNextPage endCursor }
          nodes { id discount { ${discountFragments(includeAutoFreeShipping)} } }
        }
      }
    `
    const out: DiscountSummary[] = []
    let after: string | null = null
    for (let page = 0; page < 10; page++) {
      const data: {
        discountNodes: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
          nodes: { id: string; discount: RawDiscount }[]
        }
      } = await shopify.graphql(query, { after })
      out.push(...data.discountNodes.nodes.map((n) => normalize(n.id, n.discount)))
      if (!data.discountNodes.pageInfo.hasNextPage) break
      after = data.discountNodes.pageInfo.endCursor
    }
    return out
  })
}

export async function getDiscount(shopify: Shopify, id: string): Promise<DiscountSummary | null> {
  return withFreeShippingFallback(async (includeAutoFreeShipping) => {
    const data = await shopify.graphql<{ discountNode: { id: string; discount: RawDiscount } | null }>(
      `query OneDiscount($id: ID!) { discountNode(id: $id) { id discount { ${discountFragments(includeAutoFreeShipping)} } } }`,
      { id },
    )
    return data.discountNode ? normalize(data.discountNode.id, data.discountNode.discount) : null
  })
}

// Whether a discount can be advertised on a given product's page.
export function discountAppliesToProduct(d: DiscountSummary, productId: number): boolean {
  return d.appliesTo === 'all' || (d.appliesTo === 'products' && d.productIds.includes(productId))
}

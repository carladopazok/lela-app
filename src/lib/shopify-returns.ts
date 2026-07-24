import type { createShopifyClient } from '@/lib/shopify'

// Matches the user-facing reason list for the Product Health flag: sizing (too big/small),
// style (color/style), not as described, changed mind, wrong item, damaged/defective.
// OTHER and UNKNOWN are intentionally excluded — not actionable product-health signals.
export const QUALIFYING_RETURN_REASONS = new Set([
  'SIZE_TOO_SMALL',
  'SIZE_TOO_LARGE',
  'STYLE',
  'COLOR',
  'NOT_AS_DESCRIBED',
  'UNWANTED',
  'WRONG_ITEM',
  'DEFECTIVE',
])

const RETURNS_QUERY = `
  query ProductHealthReturns($cursor: String) {
    orders(first: 50, after: $cursor) {
      edges {
        cursor
        node {
          returns(first: 20) {
            edges {
              node {
                returnLineItems(first: 20) {
                  edges {
                    node {
                      quantity
                      returnReason
                      fulfillmentLineItem {
                        lineItem {
                          title
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`

interface ReturnsQueryResult {
  orders: {
    edges: Array<{
      cursor: string
      node: {
        returns: {
          edges: Array<{
            node: {
              returnLineItems: {
                edges: Array<{
                  node: {
                    quantity: number
                    returnReason: string | null
                    fulfillmentLineItem: { lineItem: { title: string } | null } | null
                  }
                }>
              }
            }
          }>
        }
      }
    }>
    pageInfo: { hasNextPage: boolean }
  }
}

// Requires the read_returns scope — throws (via shopify.graphql) if it's not granted, which
// callers should treat as "return data unavailable" rather than a hard failure, same as the
// read_products/read_inventory fallback pattern elsewhere in this codebase.
export async function fetchQualifyingReturnsByTitle(
  shopify: ReturnType<typeof createShopifyClient>,
): Promise<Map<string, number>> {
  const returnsByTitle = new Map<string, number>()
  let cursor: string | null = null

  while (true) {
    const data: ReturnsQueryResult = await shopify.graphql<ReturnsQueryResult>(RETURNS_QUERY, { cursor })

    for (const orderEdge of data.orders.edges) {
      for (const returnEdge of orderEdge.node.returns.edges) {
        for (const lineItemEdge of returnEdge.node.returnLineItems.edges) {
          const { quantity, returnReason, fulfillmentLineItem } = lineItemEdge.node
          const title = fulfillmentLineItem?.lineItem?.title
          if (!title || !returnReason || !QUALIFYING_RETURN_REASONS.has(returnReason)) continue
          returnsByTitle.set(title, (returnsByTitle.get(title) ?? 0) + quantity)
        }
      }
    }

    if (!data.orders.pageInfo.hasNextPage || data.orders.edges.length === 0) break
    cursor = data.orders.edges[data.orders.edges.length - 1].cursor
  }

  return returnsByTitle
}

export interface DummyReturnEntry {
  title: string
  reason: string
  quantity: number
}

// Shared with the real GraphQL path's filtering rule, so dummy mode demonstrates the same
// OTHER/UNKNOWN exclusion and per-title aggregation as production data.
export function aggregateQualifyingReturns(entries: DummyReturnEntry[]): Map<string, number> {
  const returnsByTitle = new Map<string, number>()
  for (const { title, reason, quantity } of entries) {
    if (!QUALIFYING_RETURN_REASONS.has(reason)) continue
    returnsByTitle.set(title, (returnsByTitle.get(title) ?? 0) + quantity)
  }
  return returnsByTitle
}

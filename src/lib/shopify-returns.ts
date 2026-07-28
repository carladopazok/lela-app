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

// returnLineItems resolves to the ReturnLineItemType interface (implemented by ReturnLineItem
// and UnverifiedReturnLineItem) — fulfillmentLineItem only exists on the concrete ReturnLineItem
// type, so it needs an inline fragment. Without it Shopify rejects the query outright with
// "Field 'fulfillmentLineItem' doesn't exist on type 'ReturnLineItemType'".
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
                      ... on ReturnLineItem {
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
                    // Absent for UnverifiedReturnLineItem nodes — the inline fragment above only
                    // matches ReturnLineItem, so this field is missing rather than null on those.
                    fulfillmentLineItem?: { lineItem: { title: string } | null } | null
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

// Per-title return detail. `qualifyingUnits` drives the Product Health flag; `byReason` keeps
// every reason seen — including the OTHER/UNKNOWN ones excluded from the flag — so the drilldown
// chart can show the full picture of why a product comes back.
export interface ReturnBreakdown {
  qualifyingUnits: number
  byReason: Record<string, number>
}

function addReturn(
  breakdownByTitle: Map<string, ReturnBreakdown>,
  title: string,
  reason: string,
  quantity: number,
) {
  const entry = breakdownByTitle.get(title) ?? { qualifyingUnits: 0, byReason: {} }
  if (QUALIFYING_RETURN_REASONS.has(reason)) entry.qualifyingUnits += quantity
  entry.byReason[reason] = (entry.byReason[reason] ?? 0) + quantity
  breakdownByTitle.set(title, entry)
}

// Requires the read_returns scope — throws (via shopify.graphql) if it's not granted, which
// callers should treat as "return data unavailable" rather than a hard failure, same as the
// read_products/read_inventory fallback pattern elsewhere in this codebase.
export async function fetchReturnBreakdownByTitle(
  shopify: ReturnType<typeof createShopifyClient>,
): Promise<Map<string, ReturnBreakdown>> {
  const breakdownByTitle = new Map<string, ReturnBreakdown>()
  let cursor: string | null = null

  while (true) {
    const data: ReturnsQueryResult = await shopify.graphql<ReturnsQueryResult>(RETURNS_QUERY, { cursor })

    for (const orderEdge of data.orders.edges) {
      for (const returnEdge of orderEdge.node.returns.edges) {
        for (const lineItemEdge of returnEdge.node.returnLineItems.edges) {
          const { quantity, returnReason, fulfillmentLineItem } = lineItemEdge.node
          const title = fulfillmentLineItem?.lineItem?.title
          if (!title) continue
          addReturn(breakdownByTitle, title, returnReason ?? 'UNKNOWN', quantity)
        }
      }
    }

    if (!data.orders.pageInfo.hasNextPage || data.orders.edges.length === 0) break
    cursor = data.orders.edges[data.orders.edges.length - 1].cursor
  }

  return breakdownByTitle
}

export interface DummyReturnEntry {
  title: string
  reason: string
  quantity: number
}

// Shared with the real GraphQL path's aggregation rule, so dummy mode demonstrates the same
// OTHER/UNKNOWN exclusion and per-title breakdown as production data.
export function aggregateReturnBreakdown(entries: DummyReturnEntry[]): Map<string, ReturnBreakdown> {
  const breakdownByTitle = new Map<string, ReturnBreakdown>()
  for (const { title, reason, quantity } of entries) {
    addReturn(breakdownByTitle, title, reason, quantity)
  }
  return breakdownByTitle
}

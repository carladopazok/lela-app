import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'

interface ShopifyqlColumn {
  name: string
  dataType: string
  displayName: string
}

interface ShopifyqlQueryResult {
  shopifyqlQuery: {
    tableData: { columns: ShopifyqlColumn[]; rows: unknown } | null
    parseErrors: string[]
  }
}

// Mirrors the period semantics of /api/shopify/sales-overview (days=0 → Today, days=-1 → All
// Time), translated into ShopifyQL's SINCE clause. UNTIL is omitted — it defaults to "today".
function sinceClauseFor(days: number): string {
  if (days === 0) return 'today'
  if (days === -1) return '2020-01-01'
  return `-${days}d`
}

// `rows` is typed as raw JSON by Shopify's schema — defensively support either an array of
// arrays (aligned with `columns` order) or an array of objects keyed by column name.
function extractValue(row: unknown, columnName: string, columnIndex: number): number {
  if (Array.isArray(row)) return Number(row[columnIndex] ?? 0)
  if (row && typeof row === 'object') return Number((row as Record<string, unknown>)[columnName] ?? 0)
  return 0
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')
    const since = sinceClauseFor(days)

    const query = `
      query {
        shopifyqlQuery(query: "FROM sessions SHOW sessions, conversion_rate SINCE ${since}") {
          tableData {
            columns { name dataType displayName }
            rows
          }
          parseErrors
        }
      }
    `

    const data = await shopify.graphql<ShopifyqlQueryResult>(query)
    const { tableData, parseErrors } = data.shopifyqlQuery

    if (parseErrors.length > 0) {
      throw new Error(`ShopifyQL parse error: ${parseErrors.join('; ')}`)
    }

    const rows = Array.isArray(tableData?.rows) ? tableData!.rows : []
    if (!tableData || rows.length === 0) {
      return NextResponse.json({ sessions: 0, conversionRate: 0 })
    }

    const columns = tableData.columns
    const sessionsIdx = columns.findIndex((c) => c.name === 'sessions')
    const conversionIdx = columns.findIndex((c) => c.name === 'conversion_rate')
    const conversionColumn = columns[conversionIdx]
    const row = rows[0]

    const sessions = extractValue(row, 'sessions', sessionsIdx)
    const rawConversionRate = extractValue(row, 'conversion_rate', conversionIdx)
    // ShopifyQL returns conversion_rate as a fraction (e.g. 0.0063), not a percent — scale it
    // up so callers can format it directly as "0.63%". Confirmed empirically: a raw value of
    // 0.0063 was being displayed as "0.0%" before this fix, for a store with a ~0.63% rate.
    const conversionRate = rawConversionRate * 100

    console.log(`[conversion-rate] days=${days} since=${since} | sessions=${sessions} | conversion_rate raw=${rawConversionRate} scaled=${conversionRate} (dataType=${conversionColumn?.dataType})`)

    return NextResponse.json({ sessions, conversionRate })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[conversion-rate] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

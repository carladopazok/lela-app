import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { REVENUE_STATUSES } from '@/lib/shopify-constants'
import { readProductCategories } from '@/lib/product-categories-storage'
import { readProductCogs } from '@/lib/product-cogs-storage'
import { readDummyOrders } from '@/lib/dummy-data'
import type { ShopifyOrder, ShopifyProduct, ProductSummary } from '@/types'

interface SalesEntry {
  unitsSold: number
  unitsSoldWeek: number
  unitsSoldMonth: number
  revenue: number
  orderIds: Set<number>
  imageUrl: string | null
  vendor: string
  productType: string
  lastSoldAt: string | null
}

// Sales stats always come from order line_items. The product catalog itself is fetched from
// /products.json when possible, but read_products may not be granted (see CLAUDE.md) — falls
// back to a catalog derived from sold line items if that call fails. Inventory levels, product
// status/publish state, and price only exist when the catalog fetch succeeds — there's no
// order-derived equivalent for "units currently on hand".
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString()
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)
    const monthAgo = new Date(Date.now() - 30 * 86_400_000)

    const [shopResult, orders] = await Promise.all([
      shopify.get<{ shop: { currency: string } }>('/shop.json'),
      shopify.getAll<ShopifyOrder>('/orders.json', 'orders', {
        status: 'any',
        created_at_min: yearAgo,
        fields: 'id,created_at,financial_status,line_items',
      }),
    ])

    if (req.nextUrl.searchParams.get('dummy') === '1') {
      orders.push(...readDummyOrders().filter((o) => o.created_at >= yearAgo))
    }

    const productCategoryMap = readProductCategories()
    const productCogsMap = readProductCogs()

    const salesMap = new Map<string, SalesEntry>()

    for (const order of orders) {
      if (!REVENUE_STATUSES.has(order.financial_status)) continue
      const orderDate = new Date(order.created_at)

      for (const item of order.line_items ?? []) {
        if (!item.title) continue

        const entry = salesMap.get(item.title) ?? {
          unitsSold: 0,
          unitsSoldWeek: 0,
          unitsSoldMonth: 0,
          revenue: 0,
          orderIds: new Set<number>(),
          imageUrl: item.image_url ?? null,
          vendor: item.vendor ?? '',
          productType: item.product_type ?? '',
          lastSoldAt: null,
        }

        entry.unitsSold += item.quantity
        entry.revenue += parseFloat(item.price) * item.quantity
        if (orderDate >= weekAgo) entry.unitsSoldWeek += item.quantity
        if (orderDate >= monthAgo) entry.unitsSoldMonth += item.quantity
        entry.orderIds.add(order.id)
        if (!entry.imageUrl && item.image_url) entry.imageUrl = item.image_url
        if (!entry.lastSoldAt || order.created_at > entry.lastSoldAt) entry.lastSoldAt = order.created_at

        salesMap.set(item.title, entry)
      }
    }

    let products: ProductSummary[]
    let source: 'catalog' | 'orders'

    try {
      const shopifyProducts = await shopify.getAll<ShopifyProduct>('/products.json', 'products', {
        fields: 'id,title,vendor,product_type,tags,image,status,variants,published_at,created_at',
      })

      source = 'catalog'
      products = shopifyProducts.map((p) => {
        const sales = salesMap.get(p.title)
        const tags = (p.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
        const inventoryQuantity = (p.variants ?? []).reduce<number | null>((sum, v) => {
          if (v.inventory_quantity == null) return sum
          return (sum ?? 0) + v.inventory_quantity
        }, null)
        const firstVariantPrice = p.variants?.[0]?.price
        return {
          title: p.title,
          category: productCategoryMap[p.title] || (tags.length > 0 ? tags.join(', ') : p.product_type?.trim() || null),
          imageUrl: p.image?.src ?? sales?.imageUrl ?? null,
          vendor: p.vendor ?? '',
          unitsSold: sales?.unitsSold ?? 0,
          unitsSoldWeek: sales?.unitsSoldWeek ?? 0,
          unitsSoldMonth: sales?.unitsSoldMonth ?? 0,
          revenue: sales?.revenue ?? 0,
          ordersCount: sales?.orderIds.size ?? 0,
          productId: p.id,
          inventoryQuantity,
          status: p.status ?? null,
          publishedAt: p.published_at ?? null,
          price: firstVariantPrice != null ? parseFloat(firstVariantPrice) : null,
          lastSoldAt: sales?.lastSoldAt ?? null,
          cogs: productCogsMap[p.title] ?? null,
        }
      })
    } catch (err) {
      console.warn('[products] could not fetch full catalog (likely missing read_products scope), falling back to order-derived list:', err instanceof Error ? err.message : err)
      source = 'orders'
      products = Array.from(salesMap.entries()).map(([title, sales]) => ({
        title,
        category: productCategoryMap[title] || sales.productType?.trim() || null,
        imageUrl: sales.imageUrl,
        vendor: sales.vendor,
        unitsSold: sales.unitsSold,
        unitsSoldWeek: sales.unitsSoldWeek,
        unitsSoldMonth: sales.unitsSoldMonth,
        revenue: sales.revenue,
        ordersCount: sales.orderIds.size,
        productId: null,
        inventoryQuantity: null,
        status: null,
        publishedAt: null,
        price: null,
        lastSoldAt: sales.lastSoldAt,
        cogs: productCogsMap[title] ?? null,
      }))
    }

    return NextResponse.json({ products, currency: shopResult.shop.currency, source, inventoryAvailable: source === 'catalog' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

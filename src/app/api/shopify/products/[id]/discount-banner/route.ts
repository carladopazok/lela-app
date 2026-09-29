import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { getDiscount, discountAppliesToProduct } from '@/lib/shopify-discount-list'
import { readDiscountBanners, writeDiscountBanners } from '@/lib/product-discount-banners-storage'

interface RouteParams {
  params: { id: string }
}

interface UserError { field: string[] | null; message: string }

const METAFIELDS_SET = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`

const METAFIELDS_DELETE = `
  mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key namespace ownerId }
      userErrors { field message }
    }
  }
`

const METAFIELD_DEFINITION_CREATE = `
  mutation CreateDiscountBannerDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`

// Best-effort, same as the Final Sale/Fit Note routes: the definition only makes the metafield
// visible on the product's Admin page — never lets it block the actual value write.
async function ensureDefinition(shopify: ReturnType<typeof createShopifyClient>): Promise<void> {
  try {
    const data = await shopify.graphql<{
      metafieldDefinitionCreate: { userErrors: { field: string[] | null; message: string; code: string }[] }
    }>(METAFIELD_DEFINITION_CREATE, {
      definition: { name: 'Discount Banner', namespace: 'custom', key: 'discount_banner', type: 'json', ownerType: 'PRODUCT' },
    })
    const errors = data.metafieldDefinitionCreate.userErrors.filter((e) => e.code !== 'TAKEN')
    if (errors.length > 0) console.warn('[discount-banner] metafieldDefinitionCreate userErrors:', errors)
  } catch (err) {
    console.warn('[discount-banner] metafieldDefinitionCreate failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}

// Publish a banner advertising `discountId` on this product's storefront page: writes the
// custom.discount_banner JSON metafield, rendered by theme-snippets/discount-banner.liquid.
// The discount is re-read from Shopify here (not trusted from the client) to confirm it's
// active and actually applies to this product, and to take its real code/title/end date.
// Needs write_products (metafield) + read_discounts (the discount lookup).
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { discountId, message }: { discountId: unknown; message: unknown } = await req.json()
    if (typeof discountId !== 'string' || !discountId) {
      return NextResponse.json({ error: 'discountId is required' }, { status: 400 })
    }
    const text = typeof message === 'string' ? message.trim() : ''
    if (!text || text.length > 200) {
      return NextResponse.json({ error: 'Banner message must be 1–200 characters' }, { status: 400 })
    }

    const shopify = createShopifyClient(session)
    const discount = await getDiscount(shopify, discountId)
    if (!discount) return NextResponse.json({ error: 'Discount not found on Shopify' }, { status: 404 })
    if (discount.status !== 'ACTIVE') {
      return NextResponse.json({ error: `Discount "${discount.title}" is ${discount.status.toLowerCase()}, not active` }, { status: 400 })
    }
    if (!discountAppliesToProduct(discount, Number(params.id))) {
      return NextResponse.json({ error: `Discount "${discount.title}" doesn't apply to this product` }, { status: 400 })
    }

    const entry = {
      discountId: discount.id,
      title: discount.title,
      code: discount.code,
      message: text,
      endsAt: discount.endsAt,
      publishedAt: new Date().toISOString(),
    }

    await ensureDefinition(shopify)
    const data = await shopify.graphql<{
      metafieldsSet: { metafields: { id: string }[]; userErrors: UserError[] }
    }>(METAFIELDS_SET, {
      metafields: [{
        ownerId: `gid://shopify/Product/${params.id}`,
        namespace: 'custom',
        key: 'discount_banner',
        type: 'json',
        // snake_case keys for the Liquid snippet
        value: JSON.stringify({ title: entry.title, code: entry.code, message: entry.message, ends_at: entry.endsAt }),
      }],
    })
    const userErrors = data.metafieldsSet.userErrors
    if (userErrors.length > 0) {
      return NextResponse.json({ error: userErrors.map((e) => e.message).join('; ') }, { status: 500 })
    }
    if (data.metafieldsSet.metafields.length === 0) {
      return NextResponse.json({ error: 'Shopify accepted the request but did not create the metafield' }, { status: 500 })
    }

    const banners = readDiscountBanners()
    banners[params.id] = entry
    writeDiscountBanners(banners)
    return NextResponse.json({ banner: entry })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[discount-banner] publish failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Remove the banner from the storefront (deletes the metafield) and from the local mirror.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const data = await shopify.graphql<{
      metafieldsDelete: { deletedMetafields: unknown[]; userErrors: UserError[] }
    }>(METAFIELDS_DELETE, {
      metafields: [{ ownerId: `gid://shopify/Product/${params.id}`, namespace: 'custom', key: 'discount_banner' }],
    })
    const userErrors = data.metafieldsDelete.userErrors
    if (userErrors.length > 0) {
      return NextResponse.json({ error: userErrors.map((e) => e.message).join('; ') }, { status: 500 })
    }
    const banners = readDiscountBanners()
    delete banners[params.id]
    writeDiscountBanners(banners)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[discount-banner] remove failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

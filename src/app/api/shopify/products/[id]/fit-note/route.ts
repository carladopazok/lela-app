import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { readFitNotes, writeFitNotes } from '@/lib/product-fit-notes-storage'

interface RouteParams {
  params: { id: string }
}

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
  mutation CreateFitNoteDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`

const GET_METAFIELD = `
  query ProductFitNoteMetafield($id: ID!) {
    product(id: $id) {
      metafield(namespace: "custom", key: "fit_note") { id namespace key value type }
    }
  }
`

interface UserError { field: string[] | null; message: string }

// Best-effort: without a metafield definition, custom.fit_note is written and fully queryable via
// the API but invisible on the product's Admin edit page. Create the definition the first time a
// note is published so it shows up there automatically — never lets a definition problem block
// the actual value write, since the definition is an Admin-UI/organizational nicety, not the data.
async function ensureFitNoteDefinition(shopify: ReturnType<typeof createShopifyClient>): Promise<void> {
  try {
    const data = await shopify.graphql<{
      metafieldDefinitionCreate: {
        createdDefinition: { id: string } | null
        userErrors: { field: string[] | null; message: string; code: string }[]
      }
    }>(METAFIELD_DEFINITION_CREATE, {
      definition: {
        name: 'Fit Note',
        namespace: 'custom',
        key: 'fit_note',
        type: 'multi_line_text_field',
        ownerType: 'PRODUCT',
      },
    })
    const errors = data.metafieldDefinitionCreate.userErrors.filter((e) => e.code !== 'TAKEN')
    if (errors.length > 0) {
      console.warn('[fit-note] metafieldDefinitionCreate userErrors:', errors)
    }
  } catch (err) {
    console.warn('[fit-note] metafieldDefinitionCreate failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}

// Diagnostic: read the metafield directly from Shopify (not from our local JSON cache), so a
// "published but not visible in Admin" report can be told apart from "never actually written."
// Shopify's product edit page only lists metafields that have a matching definition under
// Settings → Custom data — an undefined metafield can be written and fully queryable via the
// API while still being invisible there.
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const data = await shopify.graphql<{
      product: { metafield: { id: string; namespace: string; key: string; value: string; type: string } | null } | null
    }>(GET_METAFIELD, { id: `gid://shopify/Product/${params.id}` })

    return NextResponse.json({ metafield: data.product?.metafield ?? null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Publish a fit note to the product's custom.fit_note metafield. Requires write_products —
// same scope the "Hide from Store" status toggle already depends on.
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { text }: { text: string } = await req.json()
    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Non-empty text is required' }, { status: 400 })
    }

    const shopify = createShopifyClient(session)
    await ensureFitNoteDefinition(shopify)
    const data = await shopify.graphql<{
      metafieldsSet: { metafields: { id: string }[]; userErrors: UserError[] }
    }>(METAFIELDS_SET, {
      metafields: [
        {
          ownerId: `gid://shopify/Product/${params.id}`,
          namespace: 'custom',
          key: 'fit_note',
          type: 'multi_line_text_field',
          value: text.trim(),
        },
      ],
    })

    const userErrors = data.metafieldsSet.userErrors
    if (userErrors.length > 0) {
      console.warn('[fit-note] metafieldsSet userErrors:', userErrors)
      return NextResponse.json({ error: userErrors.map((e) => e.message).join('; ') }, { status: 500 })
    }
    if (data.metafieldsSet.metafields.length === 0) {
      console.warn('[fit-note] metafieldsSet returned no metafields and no userErrors — unexpected:', data)
      return NextResponse.json({ error: 'Shopify accepted the request but did not create the metafield' }, { status: 500 })
    }

    const notes = readFitNotes()
    notes[params.id] = { text: text.trim(), status: 'published', updatedAt: new Date().toISOString() }
    writeFitNotes(notes)

    return NextResponse.json({ fitNote: notes[params.id] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[fit-note] publish failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Unpublish: clears the Shopify metafield but keeps the note text locally as a draft, so
// nothing is lost — matching "draft = saved in Lela but not pushed to Shopify."
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const data = await shopify.graphql<{
      metafieldsDelete: { deletedMetafields: unknown[]; userErrors: UserError[] }
    }>(METAFIELDS_DELETE, {
      metafields: [{ ownerId: `gid://shopify/Product/${params.id}`, namespace: 'custom', key: 'fit_note' }],
    })

    const userErrors = data.metafieldsDelete.userErrors
    if (userErrors.length > 0) {
      console.warn('[fit-note] metafieldsDelete userErrors:', userErrors)
      return NextResponse.json({ error: userErrors.map((e) => e.message).join('; ') }, { status: 500 })
    }

    const notes = readFitNotes()
    const existing = notes[params.id]
    if (existing) {
      notes[params.id] = { ...existing, status: 'draft', updatedAt: new Date().toISOString() }
      writeFitNotes(notes)
    }

    return NextResponse.json({ fitNote: notes[params.id] ?? null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[fit-note] unpublish failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'

interface RouteParams {
  params: { id: string }
}

// Toggle a product's live/hidden state. Requires the write_products scope — if the
// current session predates that scope being requested, Shopify returns 403 here;
// surface the raw message so the UI can point the user at reconnecting Shopify.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { status }: { status: 'active' | 'draft' } = await req.json()
    if (status !== 'active' && status !== 'draft') {
      return NextResponse.json({ error: "status must be 'active' or 'draft'" }, { status: 400 })
    }

    const shopify = createShopifyClient(session)
    const result = await shopify.put(`/products/${params.id}.json`, {
      product: { id: parseInt(params.id), status },
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { tagsToShopifyNote, tagsToShopifyTagString } from '@/lib/tagging'
import type { CustomerTag } from '@/types'

interface RouteParams {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { tags, existingTags = '' }: { tags: CustomerTag[]; existingTags?: string } = await req.json()

    const shopify = createShopifyClient(session)

    const result = await shopify.put(`/customers/${params.id}.json`, {
      customer: {
        id: parseInt(params.id),
        note: tagsToShopifyNote(tags),
        tags: tagsToShopifyTagString(existingTags, tags),
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

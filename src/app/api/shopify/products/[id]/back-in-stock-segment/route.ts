import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { omnisendPatch, omnisendDatedGet, omnisendDatedPost, omnisendFindOrCreateContact } from '@/lib/omnisend'
import { readBackInStockSignups } from '@/lib/back-in-stock-storage'

interface RouteParams {
  params: { id: string }
}

interface OmnisendSegment {
  segmentID: string
  name: string
}

interface ListSegmentsResponse {
  segments: OmnisendSegment[]
}

const LELA_PREFIX = 'lela-'

// Unlike create-segment/route.ts (which only tags existing Omnisend contacts and skips
// anyone not found), these emails are opt-in restock signups that may not be customers
// yet — so this route creates the contact when a search misses, via omnisendFindOrCreateContact.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { productTitle }: { productTitle: string } = await req.json()
    if (!productTitle) {
      return NextResponse.json({ error: 'productTitle is required' }, { status: 400 })
    }

    const productId = params.id
    const signups = readBackInStockSignups(productId)
    const emails = [...new Set(signups.map((s) => s.email))]

    if (emails.length === 0) {
      return NextResponse.json({ error: 'No signups for this product' }, { status: 400 })
    }

    const segmentTag = `${LELA_PREFIX}restock-${productId}`

    let tagged = 0
    for (const email of emails) {
      const contact = await omnisendFindOrCreateContact(email)

      // Read current tags from Omnisend directly rather than trusting any locally-cached
      // state — PATCH fully replaces a contact's tags, same risk noted in create-segment/route.ts:44-48.
      const existingTags = contact.tags ?? []
      const nonLelaTags = existingTags.filter((t) => !t.startsWith(LELA_PREFIX))
      const existingLelaRaw = existingTags
        .filter((t) => t.startsWith(LELA_PREFIX))
        .map((t) => t.slice(LELA_PREFIX.length))
      const newLelaRaw = [...new Set([...existingLelaRaw, `restock-${productId}`])]
      const mergedTags = [...nonLelaTags, ...newLelaRaw.map((t) => `${LELA_PREFIX}${t}`)]

      await omnisendPatch(`/contacts/${contact.contactID}`, { tags: mergedTags })
      tagged++
    }

    const segmentName = `Restock: ${productTitle}`

    const existing = await omnisendDatedGet<ListSegmentsResponse>('/segments', { limit: '50', sort: 'name' })
    const found = existing.segments?.find((s) => s.name === segmentName)

    const segment = found ?? await omnisendDatedPost<OmnisendSegment>('/segments', {
      name: segmentName,
      conditionGroups: [
        { conditions: [{ entity: 'contact', junction: 'and', filters: [{ operator: 'anyOf', property: 'tags', value: [segmentTag] }] }] },
      ],
    })

    return NextResponse.json({ tagged, segment, alreadyExisted: !!found })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

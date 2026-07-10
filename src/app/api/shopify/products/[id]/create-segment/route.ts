import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { omnisendGet, omnisendPatch, omnisendDatedGet, omnisendDatedPost } from '@/lib/omnisend'
import type { OmnisendContact } from '@/types'

interface RouteParams {
  params: { id: string }
}

interface OmnisendContactsResponse {
  contacts: OmnisendContact[]
}

interface OmnisendSegment {
  segmentID: string
  name: string
}

interface ListSegmentsResponse {
  segments: OmnisendSegment[]
}

const LELA_PREFIX = 'lela-'

// Tags this contact, then defines the Omnisend segment on that tag.
// customerEmails must already be consent-filtered by the caller — this route never
// re-checks consent itself, so it can't accidentally include a non-consented contact
// unless the caller explicitly passes one in.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { customerEmails, productTitle }: { customerEmails: string[]; productTitle: string } = await req.json()
    if (!Array.isArray(customerEmails) || customerEmails.length === 0 || !productTitle) {
      return NextResponse.json({ error: 'customerEmails and productTitle are required' }, { status: 400 })
    }

    const productId = params.id
    const segmentTag = `${LELA_PREFIX}might-buy-${productId}`

    let tagged = 0
    for (const email of customerEmails) {
      // Read the contact's CURRENT tags from Omnisend directly rather than trusting any
      // locally-cached tag state — the tags PATCH endpoint fully replaces a contact's
      // lela-* tags with whatever is sent, so we must round-trip through Omnisend's own
      // data to avoid wiping out tags set by other features (VIP, cohort, country, etc.)
      // — see src/app/api/omnisend/contacts/[email]/tags/route.ts:27-29 for the same risk.
      const search = await omnisendGet<OmnisendContactsResponse>('/contacts', { email })
      const contact = search.contacts?.[0]
      if (!contact) continue

      const existingTags = contact.tags ?? []
      const nonLelaTags = existingTags.filter((t) => !t.startsWith(LELA_PREFIX))
      const existingLelaRaw = existingTags
        .filter((t) => t.startsWith(LELA_PREFIX))
        .map((t) => t.slice(LELA_PREFIX.length))
      const newLelaRaw = [...new Set([...existingLelaRaw, `might-buy-${productId}`])]
      const mergedTags = [...nonLelaTags, ...newLelaRaw.map((t) => `${LELA_PREFIX}${t}`)]

      await omnisendPatch(`/contacts/${contact.contactID}`, { tags: mergedTags })
      tagged++
    }

    const segmentName = `Might buy: ${productTitle}`

    // Avoid creating a duplicate segment if one with this name already exists —
    // same de-dupe check as src/app/api/omnisend/segments/route.ts.
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

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { omnisendGet, omnisendPatch, omnisendDatedGet, omnisendDatedPost } from '@/lib/omnisend'
import type { OmnisendContact } from '@/types'
import type { JourneyStage } from '@/lib/journey'

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

function stageSlug(stage: JourneyStage): string {
  return stage.toLowerCase().replace(/\s+/g, '-')
}

// Tags each contact with a stage-specific tag, then defines an Omnisend segment on
// that tag — same pattern as src/app/api/shopify/products/[id]/create-segment/route.ts,
// generalized from "per product" to "per journey stage". customerEmails must already
// be consent-filtered by the caller — this route never re-checks consent itself.
export async function POST(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { stage, customerEmails }: { stage: JourneyStage; customerEmails: string[] } = await req.json()
    if (!stage || !Array.isArray(customerEmails) || customerEmails.length === 0) {
      return NextResponse.json({ error: 'stage and customerEmails are required' }, { status: 400 })
    }

    const slug = stageSlug(stage)
    const segmentTag = `${LELA_PREFIX}journey-${slug}`

    let tagged = 0
    for (const email of customerEmails) {
      // Read the contact's CURRENT tags from Omnisend rather than trusting any locally
      // cached state — PATCH fully replaces a contact's lela-* tags, so we must
      // round-trip through Omnisend's own data to avoid wiping out tags set by other
      // features (VIP, cohort, country, might-buy, etc.).
      const search = await omnisendGet<OmnisendContactsResponse>('/contacts', { email })
      const contact = search.contacts?.[0]
      if (!contact) continue

      const existingTags = contact.tags ?? []
      const nonLelaTags = existingTags.filter((t) => !t.startsWith(LELA_PREFIX))
      const existingLelaRaw = existingTags
        .filter((t) => t.startsWith(LELA_PREFIX))
        .map((t) => t.slice(LELA_PREFIX.length))
      const newLelaRaw = [...new Set([...existingLelaRaw, `journey-${slug}`])]
      const mergedTags = [...nonLelaTags, ...newLelaRaw.map((t) => `${LELA_PREFIX}${t}`)]

      await omnisendPatch(`/contacts/${contact.contactID}`, { tags: mergedTags })
      tagged++
    }

    const segmentName = `Customer Journey: ${stage}`

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

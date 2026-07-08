import { NextRequest, NextResponse } from 'next/server'
import { omnisendDatedGet, omnisendDatedPost } from '@/lib/omnisend'

interface OmnisendSegment {
  segmentID: string
  name: string
}

interface ListSegmentsResponse {
  segments: OmnisendSegment[]
}

export async function POST(req: NextRequest) {
  try {
    const body: { name: string; tag?: string; tags?: string[] } = await req.json()
    const tags = body.tags ?? (body.tag ? [body.tag] : [])
    if (!body.name || tags.length === 0) {
      return NextResponse.json({ error: 'name and at least one tag are required' }, { status: 400 })
    }

    // Avoid creating duplicate segments if one with this name already exists
    const existing = await omnisendDatedGet<ListSegmentsResponse>('/segments', { limit: '50', sort: 'name' })
    const found = existing.segments?.find((s) => s.name === body.name)
    if (found) {
      return NextResponse.json({ segment: found, alreadyExisted: true })
    }

    // Each tag becomes its own condition; conditions within a group are AND'd
    // together, so combining segments here maps to "has tag A AND has tag B".
    const segment = await omnisendDatedPost<OmnisendSegment>('/segments', {
      name: body.name,
      conditionGroups: [
        {
          conditions: tags.map((tag) => ({
            entity: 'contact',
            junction: 'and',
            filters: [{ operator: 'anyOf', property: 'tags', value: [tag] }],
          })),
        },
      ],
    })

    return NextResponse.json({ segment, alreadyExisted: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

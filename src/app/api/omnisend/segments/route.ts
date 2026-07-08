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
    const { name, tag }: { name: string; tag: string } = await req.json()
    if (!name || !tag) {
      return NextResponse.json({ error: 'name and tag are required' }, { status: 400 })
    }

    // Avoid creating duplicate segments if one with this name already exists
    const existing = await omnisendDatedGet<ListSegmentsResponse>('/segments', { limit: '50', sort: 'name' })
    const found = existing.segments?.find((s) => s.name === name)
    if (found) {
      return NextResponse.json({ segment: found, alreadyExisted: true })
    }

    const segment = await omnisendDatedPost<OmnisendSegment>('/segments', {
      name,
      conditionGroups: [
        {
          conditions: [
            {
              entity: 'contact',
              junction: 'and',
              filters: [{ operator: 'anyOf', property: 'tags', value: [tag] }],
            },
          ],
        },
      ],
    })

    return NextResponse.json({ segment, alreadyExisted: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

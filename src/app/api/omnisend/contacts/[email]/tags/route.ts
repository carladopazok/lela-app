import { NextRequest, NextResponse } from 'next/server'
import { omnisendGet, omnisendPatch } from '@/lib/omnisend'
import type { OmnisendContact, CustomerTag } from '@/types'

interface RouteParams {
  params: { email: string }
}

interface OmnisendContactsResponse {
  contacts: OmnisendContact[]
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { tags }: { tags: CustomerTag[] } = await req.json()
    const email = decodeURIComponent(params.email)

    // Find contact by email
    const search = await omnisendGet<OmnisendContactsResponse>('/contacts', { email })
    const contact = search.contacts?.[0]

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found in Omnisend' }, { status: 404 })
    }

    // Merge lela tags with existing non-lela tags
    const existingTags = (contact.tags ?? []).filter((t) => !t.startsWith('lela-'))
    const lelaTags = tags.map((t) => `lela-${t}`)
    const mergedTags = [...existingTags, ...lelaTags]

    const result = await omnisendPatch(`/contacts/${contact.contactID}`, { tags: mergedTags })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

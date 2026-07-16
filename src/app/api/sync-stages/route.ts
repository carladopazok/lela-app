import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { getEnrichedCustomers } from '@/lib/customers'
import { getCustomerStages } from '@/lib/segmentation'
import { STAGE_TO_TAG } from '@/lib/tagging'
import { omnisendGet, omnisendPatch } from '@/lib/omnisend'
import { readStageMap, writeStageMap, appendStageHistory, type StageTransition } from '@/lib/stage-storage'
import type { OmnisendContact, EnrichedCustomer } from '@/types'

const LELA_PREFIX = 'lela-'
const ALL_STAGE_TAGS = new Set(Object.values(STAGE_TO_TAG))

// Removes whichever tag matches a known stage (if any) and adds the new one,
// preserving every other lela-* tag (abandoned-checkout, category-, country-,
// journey-, etc.) untouched — a targeted swap, not the full-resync-and-replace
// the manual "Sync" buttons on the Customers tab do.
function swapStageTagInList(existingRaw: string[], newStageTag: string): string[] {
  const nonLela = existingRaw.filter((t) => !t.startsWith(LELA_PREFIX))
  const existingLelaRaw = existingRaw.filter((t) => t.startsWith(LELA_PREFIX)).map((t) => t.slice(LELA_PREFIX.length))
  const keptLelaRaw = existingLelaRaw.filter((t) => !ALL_STAGE_TAGS.has(t))
  const mergedRaw = [...new Set([...keptLelaRaw, newStageTag])]
  return [...nonLela, ...mergedRaw.map((t) => `${LELA_PREFIX}${t}`)]
}

async function swapOmnisendStageTag(email: string, newStageTag: string) {
  const search = await omnisendGet<{ contacts: OmnisendContact[] }>('/contacts', { email })
  const contact = search.contacts?.[0]
  if (!contact) throw new Error('No Omnisend contact found for this email')
  const mergedTags = swapStageTagInList(contact.tags ?? [], newStageTag)
  await omnisendPatch(`/contacts/${contact.contactID}`, { tags: mergedTags })
}

async function swapShopifyStageTag(
  shopify: ReturnType<typeof createShopifyClient>,
  customer: EnrichedCustomer,
  newStageTag: string
) {
  const existingRaw = customer.tags.split(',').map((t) => t.trim()).filter(Boolean)
  const mergedTags = swapStageTagInList(existingRaw, newStageTag)
  await shopify.put(`/customers/${customer.id}.json`, {
    customer: { id: customer.id, tags: mergedTags.join(', ') },
  })
}

// Manual trigger for now (button in the Journey tab UI) — no cron. See the
// "Real-time stage-transition tracking" item in src/lib/pending-work.ts for the
// webhook/cron version once the app is deployed somewhere that can run both.
export async function POST() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const customers = await getEnrichedCustomers(shopify, false) // real data only — dummy customers aren't real Shopify/Omnisend records
    const fresh = getCustomerStages(customers)
    const customersById = new Map(customers.map((c) => [c.id, c]))

    const stageMap = readStageMap()
    const historyEntries: StageTransition[] = []
    const errors: { customerId: number; email: string; error: string }[] = []
    let changed = 0

    for (const { id, email, stage } of fresh) {
      const key = String(id)
      const prior = stageMap[key]
      if (prior && prior.stage === stage) continue // unchanged — no external calls, no write

      try {
        const customer = customersById.get(id)
        if (!customer) throw new Error('Customer missing from fresh fetch')
        const newTag = STAGE_TO_TAG[stage]

        // Both platforms must succeed for this transition to count as synced — a
        // customer_stage record should only ever reflect "Shopify and Omnisend both
        // agree," otherwise the two platforms silently drift out of sync with each
        // other, which is exactly the messy-automation risk this is meant to avoid.
        await swapShopifyStageTag(shopify, customer, newTag)
        if (!email) throw new Error('Customer has no email — cannot sync to Omnisend')
        await swapOmnisendStageTag(email, newTag)

        const changedAt = new Date().toISOString()
        stageMap[key] = { stage, updatedAt: changedAt }
        historyEntries.push({ customerId: id, oldStage: prior?.stage ?? null, newStage: stage, changedAt })
        changed++
      } catch (err) {
        // Either platform failed — customer_stage is NOT updated, so the next run
        // retries this same transition instead of silently accepting a half-synced state.
        errors.push({ customerId: id, email, error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    writeStageMap(stageMap)
    appendStageHistory(historyEntries)

    return NextResponse.json({ checked: fresh.length, changed, errors })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

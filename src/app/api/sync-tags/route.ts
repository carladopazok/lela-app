import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { getEnrichedCustomers } from '@/lib/customers'
import { classifyCustomerStage, type LifecycleStage } from '@/lib/segmentation'
import { computeRfmTier, type RFMSegment } from '@/lib/rfm'
import { swapNamespacedTagsInList, STAGE_TAG_VALUES, RFM_TAG_VALUES } from '@/lib/tag-sync'
import { omnisendGet, omnisendPatch } from '@/lib/omnisend'
import { readTagSyncMap, writeTagSyncMap, readTagSyncMeta, writeTagSyncMeta, type TagSyncRecord } from '@/lib/tag-sync-storage'
import type { OmnisendContact, EnrichedCustomer } from '@/types'

const REENGAGED_STAGES = new Set<LifecycleStage>(['New', 'Active', 'Loyal', 'VIP'])
const LAPSE_STAGES = new Set<LifecycleStage>(['Winback', 'Lapsed'])

// Freeze rfm-at-lapse the moment a customer first enters Winback/Lapsed; clear it
// only on genuine re-engagement (back into New/Active/Loyal/VIP). At-Risk and Lost
// are decay-adjacent, not re-engagement, and aren't one of the two states the spec
// names as freeze triggers — so transitions into/within them leave it untouched.
function nextRfmAtLapse(newStage: LifecycleStage, currentRfmTier: RFMSegment | null, priorRfmAtLapse: RFMSegment | null): RFMSegment | null {
  if (LAPSE_STAGES.has(newStage) && priorRfmAtLapse === null) return currentRfmTier
  if (REENGAGED_STAGES.has(newStage) && priorRfmAtLapse !== null) return null
  return priorRfmAtLapse
}

async function pushNamespacedTagsToOmnisend(email: string, updates: Partial<Record<'stage' | 'rfm' | 'rfm-at-lapse', string | null>>) {
  const search = await omnisendGet<{ contacts: OmnisendContact[] }>('/contacts', { email })
  const contact = search.contacts?.[0]
  if (!contact) throw new Error('No Omnisend contact found for this email')
  const mergedTags = swapNamespacedTagsInList(contact.tags ?? [], updates)
  await omnisendPatch(`/contacts/${contact.contactID}`, { tags: mergedTags })
}

async function pushNamespacedTagsToShopify(
  shopify: ReturnType<typeof createShopifyClient>,
  customer: EnrichedCustomer,
  updates: Partial<Record<'stage' | 'rfm' | 'rfm-at-lapse', string | null>>
) {
  const existingRaw = customer.tags.split(',').map((t) => t.trim()).filter(Boolean)
  const mergedTags = swapNamespacedTagsInList(existingRaw, updates)
  await shopify.put(`/customers/${customer.id}.json`, {
    customer: { id: customer.id, tags: mergedTags.join(', ') },
  })
}

// Manual trigger for now (button in the Journey tab UI, next to "Sync Stages to
// Omnisend") — no webhooks, no cron. See the "Real-time stage-transition tracking"
// item in src/lib/pending-work.ts for the webhook/cron version once the app is
// deployed somewhere that can run both. Additive to the existing /api/sync-stages
// route — writes namespaced stage:*/rfm:*/rfm-at-lapse:* tags for Omnisend automation
// branching, distinct from that route's un-namespaced lela-* tags used for the
// Customers-tab display.
export async function POST() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const customers = await getEnrichedCustomers(shopify, false) // real data only — dummy customers aren't real Shopify/Omnisend records
    const customersById = new Map(customers.map((c) => [c.id, c]))

    const tagSyncMap = readTagSyncMap()
    const errors: { customerId: number; email: string; error: string }[] = []
    let changed = 0

    for (const customer of customers) {
      const key = String(customer.id)
      const stage = classifyCustomerStage({
        ordersCount: customer.orders_count,
        lastOrderDate: customer.lastOrderDate ? new Date(customer.lastOrderDate) : null,
        emailMarketingConsentState: customer.email_marketing_consent?.state,
      })
      const prior = tagSyncMap[key]
      if (prior && prior.stage === stage) continue // unchanged — no external calls, no write

      try {
        const rfmTier = computeRfmTier(stage)
        const priorRfmAtLapse = prior?.rfmAtLapse ?? null
        const rfmAtLapse = nextRfmAtLapse(stage, rfmTier, priorRfmAtLapse)

        const updates: Partial<Record<'stage' | 'rfm' | 'rfm-at-lapse', string | null>> = {
          stage: STAGE_TAG_VALUES[stage],
          rfm: rfmTier ? RFM_TAG_VALUES[rfmTier] : null,
        }
        if (rfmAtLapse !== priorRfmAtLapse) {
          updates['rfm-at-lapse'] = rfmAtLapse ? RFM_TAG_VALUES[rfmAtLapse] : null
        }

        // Both platforms must succeed for this transition to count as synced — same
        // discipline as /api/sync-stages, otherwise the two platforms can silently
        // drift out of sync with each other.
        await pushNamespacedTagsToShopify(shopify, customer, updates)
        if (!customer.email) throw new Error('Customer has no email — cannot sync to Omnisend')
        await pushNamespacedTagsToOmnisend(customer.email, updates)

        const record: TagSyncRecord = {
          stage,
          rfmTier,
          rfmAtLapse,
          source: prior?.source ?? null,
          updatedAt: new Date().toISOString(),
          sourceUpdatedAt: prior?.sourceUpdatedAt ?? null,
        }
        tagSyncMap[key] = record
        changed++
      } catch (err) {
        // Either platform failed — the record is NOT updated, so the next run
        // retries this same transition instead of silently accepting a half-synced state.
        errors.push({ customerId: customer.id, email: customer.email, error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    writeTagSyncMap(tagSyncMap)
    const lastSyncAt = new Date().toISOString()
    writeTagSyncMeta({ lastSyncAt })

    return NextResponse.json({ checked: customers.length, changed, errors, lastSyncAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json(readTagSyncMeta())
}

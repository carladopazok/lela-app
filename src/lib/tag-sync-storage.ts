import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import type { LifecycleStage } from './segmentation'
import type { RFMSegment } from './rfm'
import type { SourceValue } from './tag-sync'

const DATA_DIR = path.join(process.cwd(), 'data')
const TAG_SYNC_FILE = path.join(DATA_DIR, 'customer-tag-sync.json')
const TAG_SYNC_META_FILE = path.join(DATA_DIR, 'customer-tag-sync-meta.json')

export interface TagSyncRecord {
  stage: LifecycleStage
  rfmTier: RFMSegment | null // null for 'Never Purchased' — outside RFM's scope, same carve-out rfm.ts makes
  rfmAtLapse: RFMSegment | null
  source: SourceValue | null
  updatedAt: string // stage and rfmTier always change together (rfmTier is derived from stage) — one timestamp covers both
  sourceUpdatedAt: string | null
}

// Keyed by Shopify customer id (as a string — JSON object keys are always strings).
export type TagSyncMap = Record<string, TagSyncRecord>

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function readTagSyncMap(): TagSyncMap {
  try {
    if (!existsSync(TAG_SYNC_FILE)) return {}
    return JSON.parse(readFileSync(TAG_SYNC_FILE, 'utf-8')) as TagSyncMap
  } catch {
    return {}
  }
}

export function writeTagSyncMap(map: TagSyncMap) {
  ensureDataDir()
  writeFileSync(TAG_SYNC_FILE, JSON.stringify(map, null, 2))
}

export interface TagSyncMeta {
  lastSyncAt: string | null
}

// Tracks when POST /api/sync-tags last ran, separate from per-customer updatedAt —
// this is "when did the run last happen" (shown next to the Sync Tags button),
// not "when did this specific customer last change".
export function readTagSyncMeta(): TagSyncMeta {
  try {
    if (!existsSync(TAG_SYNC_META_FILE)) return { lastSyncAt: null }
    return JSON.parse(readFileSync(TAG_SYNC_META_FILE, 'utf-8')) as TagSyncMeta
  } catch {
    return { lastSyncAt: null }
  }
}

export function writeTagSyncMeta(meta: TagSyncMeta) {
  ensureDataDir()
  writeFileSync(TAG_SYNC_META_FILE, JSON.stringify(meta, null, 2))
}

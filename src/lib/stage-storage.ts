import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import type { LifecycleStage } from './segmentation'

const DATA_DIR = path.join(process.cwd(), 'data')
const STAGE_FILE = path.join(DATA_DIR, 'customer-stage.json')
const HISTORY_FILE = path.join(DATA_DIR, 'customer-stage-history.json')

export interface StoredStage {
  stage: LifecycleStage
  updatedAt: string
}

// Keyed by Shopify customer id (as a string — JSON object keys are always strings).
export type StageMap = Record<string, StoredStage>

export interface StageTransition {
  customerId: number
  oldStage: LifecycleStage | null
  newStage: LifecycleStage
  changedAt: string
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function readStageMap(): StageMap {
  try {
    if (!existsSync(STAGE_FILE)) return {}
    return JSON.parse(readFileSync(STAGE_FILE, 'utf-8')) as StageMap
  } catch {
    return {}
  }
}

export function writeStageMap(map: StageMap) {
  ensureDataDir()
  writeFileSync(STAGE_FILE, JSON.stringify(map, null, 2))
}

export function readStageHistory(): StageTransition[] {
  try {
    if (!existsSync(HISTORY_FILE)) return []
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) as StageTransition[]
  } catch {
    return []
  }
}

// Append-only — for auditing/debugging ("why did this customer get this email"),
// not read by the sync logic itself.
export function appendStageHistory(entries: StageTransition[]) {
  if (entries.length === 0) return
  ensureDataDir()
  const existing = readStageHistory()
  writeFileSync(HISTORY_FILE, JSON.stringify([...existing, ...entries], null, 2))
}

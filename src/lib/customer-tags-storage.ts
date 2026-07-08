import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const MANUAL_TAGS_FILE = path.join(DATA_DIR, 'customer-manual-tags.json')
const TAG_TYPES_FILE = path.join(DATA_DIR, 'customer-tag-types.json')

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function readManualTags(): Record<string, string[]> {
  try {
    if (!existsSync(MANUAL_TAGS_FILE)) return {}
    return JSON.parse(readFileSync(MANUAL_TAGS_FILE, 'utf-8')) as Record<string, string[]>
  } catch {
    return {}
  }
}

export function writeManualTags(data: Record<string, string[]>) {
  ensureDataDir()
  writeFileSync(MANUAL_TAGS_FILE, JSON.stringify(data, null, 2))
}

export function readCustomerTagTypes(): string[] {
  try {
    if (!existsSync(TAG_TYPES_FILE)) return []
    return JSON.parse(readFileSync(TAG_TYPES_FILE, 'utf-8')) as string[]
  } catch {
    return []
  }
}

export function writeCustomerTagTypes(types: string[]) {
  ensureDataDir()
  writeFileSync(TAG_TYPES_FILE, JSON.stringify(types, null, 2))
}

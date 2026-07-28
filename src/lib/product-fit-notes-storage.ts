import fs from 'fs'
import path from 'path'
import type { FitNoteEntry, FitNotesStore } from '@/types'

const FILE = path.join(process.cwd(), 'data', 'product-fit-notes.json')

// { "8123456789": { "text": "...", "status": "draft", "updatedAt": "..." }, ... } — keyed by Shopify product id
export function readFitNotes(): FitNotesStore {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeFitNotes(data: FitNotesStore): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

export type { FitNoteEntry, FitNotesStore }

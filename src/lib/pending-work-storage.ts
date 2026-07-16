import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const DONE_FILE = path.join(DATA_DIR, 'pending-work-done.json')

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function readDoneIds(): string[] {
  try {
    if (!existsSync(DONE_FILE)) return []
    return JSON.parse(readFileSync(DONE_FILE, 'utf-8')) as string[]
  } catch {
    return []
  }
}

export function writeDoneIds(ids: string[]) {
  ensureDataDir()
  writeFileSync(DONE_FILE, JSON.stringify(ids, null, 2))
}

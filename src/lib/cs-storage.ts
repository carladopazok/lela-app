import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import type { CSTicket, CSMacro, AgentGuidance } from '@/types'

const DATA_DIR = path.join(process.cwd(), 'data')
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json')
const MACROS_FILE = path.join(DATA_DIR, 'macros.json')
const CUSTOM_TAGS_FILE = path.join(DATA_DIR, 'custom-tags.json')
const HIDDEN_TAGS_FILE = path.join(DATA_DIR, 'hidden-tags.json')
const AGENT_GUIDANCE_FILE = path.join(DATA_DIR, 'agent-guidance.json')

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function readTickets(): CSTicket[] {
  try {
    if (!existsSync(TICKETS_FILE)) return []
    return JSON.parse(readFileSync(TICKETS_FILE, 'utf-8')) as CSTicket[]
  } catch {
    return []
  }
}

export function writeTickets(tickets: CSTicket[]) {
  ensureDataDir()
  writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2))
}

export function readMacros(): CSMacro[] {
  try {
    if (!existsSync(MACROS_FILE)) return []
    return JSON.parse(readFileSync(MACROS_FILE, 'utf-8')) as CSMacro[]
  } catch {
    return []
  }
}

export function writeMacros(macros: CSMacro[]) {
  ensureDataDir()
  writeFileSync(MACROS_FILE, JSON.stringify(macros, null, 2))
}

export function readCustomTags(): string[] {
  try {
    if (!existsSync(CUSTOM_TAGS_FILE)) return []
    return JSON.parse(readFileSync(CUSTOM_TAGS_FILE, 'utf-8')) as string[]
  } catch {
    return []
  }
}

export function writeCustomTags(tags: string[]) {
  ensureDataDir()
  writeFileSync(CUSTOM_TAGS_FILE, JSON.stringify(tags, null, 2))
}

export function readHiddenTags(): string[] {
  try {
    if (!existsSync(HIDDEN_TAGS_FILE)) return []
    return JSON.parse(readFileSync(HIDDEN_TAGS_FILE, 'utf-8')) as string[]
  } catch {
    return []
  }
}

export function writeHiddenTags(tags: string[]) {
  ensureDataDir()
  writeFileSync(HIDDEN_TAGS_FILE, JSON.stringify(tags, null, 2))
}

export function readAgentGuidance(): AgentGuidance {
  try {
    if (!existsSync(AGENT_GUIDANCE_FILE)) return { agentName: '', toneOfVoice: '', standardMessage: '', notes: [] }
    return JSON.parse(readFileSync(AGENT_GUIDANCE_FILE, 'utf-8')) as AgentGuidance
  } catch {
    return { agentName: '', toneOfVoice: '', standardMessage: '', notes: [] }
  }
}

export function writeAgentGuidance(guidance: AgentGuidance) {
  ensureDataDir()
  writeFileSync(AGENT_GUIDANCE_FILE, JSON.stringify(guidance, null, 2))
}

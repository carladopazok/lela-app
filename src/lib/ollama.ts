import type { CSMessage, AgentGuidance } from '@/types'
import { retrieveContext, type RetrievedSnippet } from './pinecone'

const OLLAMA_CHAT_URL = 'https://ollama.com/api/chat'
const MODEL = 'gemma4:cloud'

export interface AiDraftCustomerContext {
  email: string
  orders_count: number
  aov: number
  lastOrderDate: string | null
  computedTags: string[]
  manualTags: string[]
}

export interface DraftTicketReplyInput {
  subject: string
  thread: CSMessage[]
  availableTags: string[]
  customer?: AiDraftCustomerContext | null
  agentGuidance?: AgentGuidance | null
  guidance?: string
}

export interface DraftTicketReplyResult {
  tag: string
  draft: string
  retrievedContext: RetrievedSnippet[]
}

function buildPrompt(
  { subject, thread, availableTags, customer, agentGuidance, guidance }: DraftTicketReplyInput,
  threadText: string,
  retrievedContext: RetrievedSnippet[]
): string {
  const contextText = retrievedContext.length
    ? retrievedContext.map((s) => `- (from "${s.source}", relevance ${s.score.toFixed(2)}):\n${s.content}`).join('\n\n')
    : '(no matching macro or policy content found)'

  const customerText = customer
    ? `Orders: ${customer.orders_count}, AOV: ${customer.aov.toFixed(2)}, Last order: ${customer.lastOrderDate ?? 'never'}, ` +
      `Computed tags: ${customer.computedTags.join(', ') || 'none'}, Manual tags: ${customer.manualTags.join(', ') || 'none'}`
    : '(no matching customer record found)'

  const hasStandingGuidance = agentGuidance && (agentGuidance.toneOfVoice.trim() || agentGuidance.notes.length > 0)
  const standingGuidanceText = hasStandingGuidance
    ? `\n\nStanding instructions for this agent — always follow these unless they conflict with the specifics of this ticket:\n` +
      (agentGuidance!.toneOfVoice.trim() ? `Tone of voice: ${agentGuidance!.toneOfVoice.trim()}\n` : '') +
      agentGuidance!.notes.map((n) => `- ${n.title}: ${n.body}`).join('\n')
    : ''

  const guidanceText = guidance?.trim()
    ? `\n\nAdditional guidance from the agent for this specific draft only — follow this in addition to the standing instructions above:\n${guidance.trim()}`
    : ''

  return `You are a customer service assistant for an ecommerce store. Given the ticket below, suggest the single best-fitting tag from the available tag list, and draft a reply. If the retrieved context below (a macro or policy excerpt) closely matches the situation, adapt it to the specifics of this ticket rather than writing from scratch; otherwise write a fresh reply in a similar tone. The retrieved context was chosen by semantic search against this ticket, but may still be irrelevant — ignore it if it doesn't actually fit.

Subject: ${subject}

Thread (oldest to newest):
${threadText}

Available tags (pick exactly one, verbatim from this list): ${availableTags.join(', ')}

Retrieved context (macros/policy excerpts most relevant to this ticket):
${contextText}

Customer context:
${customerText}${standingGuidanceText}${guidanceText}

Respond with ONLY a raw JSON object, no markdown code fences, no backticks, no explanation before or after — just the JSON object with exactly two string keys "tag" and "draft". "tag" must be one of the available tags listed above, verbatim. "draft" is the reply body only — no subject line, and no closing signature or sign-off name, even if the retrieved context includes one; any signature is appended automatically afterward.`
}

// Deterministic — not model-dependent, since a standing signature/footer must appear on
// every draft exactly as written, not paraphrased or occasionally dropped by the model.
function appendSignature(draft: string, agentGuidance?: AgentGuidance | null): string {
  const parts: string[] = []
  if (agentGuidance?.agentName?.trim()) parts.push(`— ${agentGuidance.agentName.trim()}`)
  if (agentGuidance?.standardMessage?.trim()) parts.push(agentGuidance.standardMessage.trim())
  return parts.length ? `${draft}\n\n${parts.join('\n\n')}` : draft
}

// gemma4:cloud sometimes wraps JSON-mode output in a ```json ... ``` fence despite
// instructions not to — strip it before parsing rather than failing on well-formed
// output that's just fenced.
function stripCodeFence(content: string): string {
  const fenced = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenced ? fenced[1] : content
}

export async function draftTicketReply(input: DraftTicketReplyInput): Promise<DraftTicketReplyResult> {
  const apiKey = process.env.OLLAMA_API_KEY
  if (!apiKey) {
    throw new Error('OLLAMA_API_KEY is not set — add it to .env.local and restart the dev server.')
  }

  const threadText = input.thread
    .map((m) => `[${m.direction}] ${m.direction === 'inbound' ? m.from : 'agent'}: ${m.body}`)
    .join('\n\n')

  // Retrieval step (Pinecone) runs before generation (gemma4) — semantic search against
  // the ticket content replaces the old approach of dumping every macro into the prompt.
  const retrievedContext = await retrieveContext(`${input.subject}\n\n${threadText}`)

  const res = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [{ role: 'user', content: buildPrompt(input, threadText, retrievedContext) }],
      // Ollama's JSON-schema `format` field is silently ignored by gemma4:cloud (verified
      // against the docs' own schema example — it just returns free-form prose). Plain
      // `format: "json"` does work, so structure is enforced via the prompt instead.
      format: 'json',
    }),
  })

  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  const content = data?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`Ollama returned an unexpected response shape: ${JSON.stringify(data)}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(content))
  } catch {
    throw new Error(`Ollama response was not valid JSON: ${content}`)
  }

  if (
    typeof parsed !== 'object' || parsed === null ||
    typeof (parsed as Record<string, unknown>).tag !== 'string' ||
    typeof (parsed as Record<string, unknown>).draft !== 'string'
  ) {
    throw new Error(`Ollama response was missing "tag"/"draft" fields: ${content}`)
  }

  const result = parsed as { tag: string; draft: string }
  return {
    tag: result.tag,
    draft: appendSignature(result.draft, input.agentGuidance),
    retrievedContext,
  }
}

export interface AskAssistantInput {
  question: string
  context: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

const ASSISTANT_SYSTEM_PROMPT = `You are "Helper", an assistant embedded in a Shopify ecommerce operations dashboard called Lela. Answer the user's question using ONLY the data digest provided below — it's a live snapshot of the store's customers, products, and CS tickets. If the digest doesn't contain enough information to answer confidently, say so plainly rather than guessing or making up numbers. When a digest line labels several distinct numbers (e.g. product count vs. units vs. revenue), quote the specific one the question asks for exactly as given — never merge, average, or substitute one for another, and never recompute a number the digest already states. Keep answers concise and direct — a sentence or two, or a short list, not an essay. Don't repeat the question back.`

// Free-form conversational Q&A — unlike draftTicketReply, there's no structured object to
// parse, so this skips format:'json'/stripCodeFence entirely and just returns the model's
// text response.
export async function askAssistant({ question, context, history }: AskAssistantInput): Promise<string> {
  const apiKey = process.env.OLLAMA_API_KEY
  if (!apiKey) {
    throw new Error('OLLAMA_API_KEY is not set — add it to .env.local and restart the dev server.')
  }

  const messages = [
    { role: 'system', content: `${ASSISTANT_SYSTEM_PROMPT}\n\nData digest:\n${context}` },
    ...history,
    { role: 'user', content: question },
  ]

  const res = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages,
    }),
  })

  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  const content = data?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`Ollama returned an unexpected response shape: ${JSON.stringify(data)}`)
  }

  return content.trim()
}

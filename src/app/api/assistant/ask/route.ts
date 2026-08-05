import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { buildAssistantContext } from '@/lib/assistant-context'
import { askAssistant } from '@/lib/ollama'

export async function POST(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { question, history } = (await req.json()) as {
    question: string
    history?: { role: 'user' | 'assistant'; content: string }[]
  }

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  }

  const shopify = createShopifyClient(session)

  try {
    const context = await buildAssistantContext(shopify, question)
    const answer = await askAssistant({ question, context, history: history ?? [] })
    return NextResponse.json({ answer })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Assistant failed' }, { status: 500 })
  }
}

import { Pinecone } from '@pinecone-database/pinecone'

const ASSISTANT_NAME = 'lela'
const TOP_K = 4

export interface RetrievedSnippet {
  content: string
  score: number
  source: string
}

let client: Pinecone | null = null

function getClient(): Pinecone {
  const apiKey = process.env.PINECONE_API_KEY
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY is not set — add it to .env.local and restart the dev server.')
  }
  if (!client) client = new Pinecone({ apiKey })
  return client
}

// Retrieval only — uses the Assistant's Context API, which stops before the generation
// step, so no text is produced on the Pinecone side. gemma4 is still the only thing that
// drafts a reply; this just supplies it with the most relevant macro/policy snippets.
// multimodal isn't requested, so every snippet comes back as type 'text' (content: string)
// rather than the 'multimodal' variant (content: content block array).
export async function retrieveContext(query: string): Promise<RetrievedSnippet[]> {
  const assistant = getClient().assistant({ name: ASSISTANT_NAME })
  const result = await assistant.context({ query, topK: TOP_K })

  return result.snippets
    .filter((s) => s.type === 'text')
    .map((s) => ({
      content: s.content,
      score: s.score,
      source: s.reference.file?.name ?? 'unknown source',
    }))
}

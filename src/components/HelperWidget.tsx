'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_HISTORY_SENT = 10

export default function HelperWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, loading])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    const history = messages.slice(-MAX_HISTORY_SENT)
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Assistant failed')
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assistant failed'
      setMessages((prev) => [...prev, { role: 'assistant', content: `Helper couldn't answer: ${message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-h-[32rem] bg-white rounded-2xl shadow-card-hover flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-sand-200">
            <h3 className="font-serif text-lg text-charcoal-700 tracking-tight">Helper</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-charcoal-400 hover:text-charcoal-700 transition-colors p-1 -m-1 rounded-lg hover:bg-sand-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-[16rem]">
            {messages.length === 0 && (
              <p className="text-sm text-charcoal-400 font-sans">
                Ask me anything about your customers, products, orders, or CS tickets.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm font-sans whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'self-end bg-terracotta-100 text-charcoal-700'
                    : 'self-start bg-sand-100 text-charcoal-700'
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="self-start flex items-center gap-2 px-3 py-2">
                <div className="w-4 h-4 border-2 border-sand-300 border-t-terracotta-500 rounded-full animate-spin" />
                <span className="text-xs text-charcoal-400">Thinking…</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 border-t border-sand-200">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Helper…"
              disabled={loading}
              className="flex-1 rounded-xl border border-sand-300 px-3 py-2 text-sm font-sans text-charcoal-700 placeholder:text-charcoal-400 focus:outline-none focus:border-terracotta-400 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-terracotta-500 hover:bg-terracotta-600 text-white transition-colors disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-terracotta-500 hover:bg-terracotta-600 shadow-card-hover text-white flex items-center justify-center transition-colors"
        aria-label={open ? 'Close Helper' : 'Open Helper'}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  )
}

'use client'

import { useState } from 'react'
import { TrendingUp, PackageX, Mail, Users, Info, HeadphonesIcon, LineChart, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { useDummyData } from '@/lib/dummy-data-context'

export type SectionId = 'sales-overview' | 'late-shipments' | 'email-performance' | 'customer-intelligence' | 'customer-service' | 'forecast' | 'about'

const NAV_ITEMS: { id: SectionId; label: string; Icon: React.ElementType }[] = [
  { id: 'sales-overview',        label: 'Sales Overview',       Icon: TrendingUp },
  { id: 'late-shipments',        label: 'Late Shipments',       Icon: PackageX },
  { id: 'email-performance',     label: 'Email Performance',    Icon: Mail },
  { id: 'customer-intelligence', label: 'Customer Intelligence',Icon: Users },
  { id: 'customer-service',      label: 'Customer Service',     Icon: HeadphonesIcon },
  { id: 'forecast',              label: 'Revenue Forecast',     Icon: LineChart },
  { id: 'about',                 label: 'About This Tool',      Icon: Info },
]

interface SidebarProps {
  active: SectionId
  onSelect: (id: SectionId) => void
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  const { includeDummy, setIncludeDummy } = useDummyData()
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function generateDummyData() {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch('/api/dummy/generate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGenerateResult({
        ok: true,
        message: `${data.orders.toLocaleString()} orders · ${data.customers} customers · ${data.tickets} tickets generated`,
      })
    } catch (e) {
      setGenerateResult({ ok: false, message: e instanceof Error ? e.message : 'Failed to generate dummy data' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-olive-700 flex flex-col z-20">
      {/* Wordmark */}
      <div className="px-6 pt-8 pb-6 border-b border-olive-600">
        <h1 className="font-serif text-2xl text-cream-100 tracking-tight">Lela</h1>
        <p className="text-xs text-olive-200 mt-1 font-sans">Store Dashboard</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 flex flex-col gap-1">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`sidebar-link w-full text-left ${active === id ? 'sidebar-link-active' : 'sidebar-link-inactive'}`}
          >
            <Icon size={15} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 pb-7 pt-4 border-t border-olive-600">
        <button
          onClick={() => setIncludeDummy(!includeDummy)}
          className="flex items-center justify-between w-full mb-4 group"
          aria-pressed={includeDummy}
        >
          <span className="text-xs font-medium text-olive-100 group-hover:text-white transition-colors">
            Include Dummy Data
          </span>
          <span
            className={`relative inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors ${
              includeDummy ? 'bg-terracotta-500' : 'bg-olive-500'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                includeDummy ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
        <button
          onClick={generateDummyData}
          disabled={generating}
          className="flex items-center justify-center gap-2 w-full mb-2 px-3 py-2 rounded-lg bg-olive-600 hover:bg-olive-500 text-xs font-medium text-cream-100 transition-colors disabled:opacity-50"
        >
          <Sparkles size={13} className={generating ? 'animate-pulse' : ''} />
          {generating ? 'Generating…' : 'Generate Dummy Data'}
        </button>
        {generateResult && (
          <p
            className={`flex items-start gap-1.5 text-[11px] mb-4 leading-relaxed ${
              generateResult.ok ? 'text-cream-100' : 'text-terracotta-200'
            }`}
          >
            {generateResult.ok ? (
              <CheckCircle2 size={12} className="flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
            )}
            <span>{generateResult.message}</span>
          </p>
        )}
        <p className="text-xs text-olive-200 font-sans leading-relaxed">
          Connected to Shopify
          <br />
          &amp; Omnisend
        </p>
      </div>
    </aside>
  )
}

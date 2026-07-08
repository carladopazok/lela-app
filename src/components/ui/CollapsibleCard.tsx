'use client'

import { ChevronDown } from 'lucide-react'

export default function CollapsibleCard({
  label,
  count,
  isOpen,
  onToggle,
  icon,
  children,
}: {
  label: string
  count?: number
  isOpen: boolean
  onToggle: () => void
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-sand-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-charcoal-400">
          {icon}
          {label}
          {count !== undefined && <span className="text-charcoal-300 font-normal normal-case">· {count}</span>}
        </span>
        <ChevronDown size={14} className={`text-charcoal-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

'use client'

import { Eye, EyeOff } from 'lucide-react'

export default function MaskedEmail({
  email,
  hidden,
  onToggle,
  mailto = false,
  className = '',
  itemLabel = 'email',
}: {
  email: string
  hidden: boolean
  onToggle: (e: React.MouseEvent) => void
  mailto?: boolean
  className?: string
  itemLabel?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {hidden ? (
        <span>••••••••••</span>
      ) : mailto ? (
        <a href={`mailto:${email}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{email}</a>
      ) : (
        <span>{email}</span>
      )}
      <button
        onClick={onToggle}
        className="text-charcoal-300 hover:text-terracotta-500 transition-colors shrink-0"
        title={hidden ? `Show ${itemLabel}` : `Hide ${itemLabel}`}
      >
        {hidden ? <EyeOff size={11} /> : <Eye size={11} />}
      </button>
    </span>
  )
}

export function HideAllEmailsButton({ allHidden, onClick, itemLabel = 'emails' }: { allHidden: boolean; onClick: () => void; itemLabel?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs text-charcoal-400 hover:text-terracotta-500 transition-colors"
    >
      {allHidden ? <EyeOff size={12} /> : <Eye size={12} />}
      {allHidden ? `Show all ${itemLabel}` : `Hide all ${itemLabel}`}
    </button>
  )
}

import type { LucideIcon } from 'lucide-react'

interface AttentionCardProps {
  icon: LucideIcon
  tone: 'danger' | 'warning'
  label: string
  value: string
  caption?: string
  actionLabel?: string
  onAction?: () => void
  unavailable?: boolean
}

export default function AttentionCard({
  icon: Icon,
  tone,
  label,
  value,
  caption,
  actionLabel,
  onAction,
  unavailable,
}: AttentionCardProps) {
  const toneColor = tone === 'danger' ? 'text-red-600' : 'text-amber-600'
  return (
    <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon size={16} className={unavailable ? 'text-charcoal-300' : toneColor} />
        <p className="text-xs font-medium uppercase tracking-widest text-charcoal-400">{label}</p>
      </div>
      <p className={`text-2xl font-serif font-semibold tracking-tight ${unavailable ? 'text-charcoal-300' : 'text-charcoal-700'}`}>
        {unavailable ? '—' : value}
      </p>
      {caption && (
        <p className="text-xs text-charcoal-400">{unavailable ? 'data unavailable' : caption}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-auto self-start text-xs font-medium text-terracotta-500 hover:text-terracotta-600 transition-colors pt-1"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  )
}

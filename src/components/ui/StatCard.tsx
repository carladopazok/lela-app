import { ArrowUp, ArrowDown } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  accent?: boolean
  trend?: { direction: 'up' | 'down'; text: string }
}

export default function StatCard({ label, value, sub, accent, trend }: StatCardProps) {
  return (
    <div className={`rounded-2xl p-6 shadow-card flex flex-col gap-1 ${accent ? 'bg-terracotta-500 text-white' : 'bg-white'}`}>
      <p className={`text-xs font-medium uppercase tracking-widest ${accent ? 'text-terracotta-100' : 'text-charcoal-400'}`}>
        {label}
      </p>
      <p className={`text-3xl font-serif font-semibold tracking-tight ${accent ? 'text-white' : 'text-charcoal-700'}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-0.5 ${accent ? 'text-terracotta-200' : 'text-charcoal-400'}`}>
          {sub}
        </p>
      )}
      {trend && (
        <p
          className={`flex items-center gap-1 text-xs mt-0.5 font-medium ${
            accent
              ? 'text-white'
              : trend.direction === 'up' ? 'text-olive-600' : 'text-red-600'
          }`}
        >
          {trend.direction === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          {trend.text}
        </p>
      )}
    </div>
  )
}

'use client'

import { Factory, Users } from 'lucide-react'

interface ComingSoonItem {
  name: string
  Icon: React.ElementType
  description: string
}

const COMING_SOON_ITEMS: ComingSoonItem[] = [
  {
    name: 'Manufacturing & Supply',
    Icon: Factory,
    description: 'Production runs, supplier lead times, and raw material stock — planned as its own section once a supply-side data source is connected.',
  },
  {
    name: 'Affiliate Program',
    Icon: Users,
    description: 'Affiliate signups, referral performance, and commission tracking — planned once an affiliate platform is chosen and connected.',
  },
]

export default function ComingSoon() {
  return (
    <section className="max-w-2xl">
      <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight mb-1">Coming Soon</h2>
      <p className="text-sm text-charcoal-400 mb-8">Future dashboard areas that aren't built yet.</p>

      <div className="flex flex-col gap-4">
        {COMING_SOON_ITEMS.map((item) => (
          <div key={item.name} className="bg-white rounded-2xl shadow-card p-5 border border-dashed border-sand-300">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <item.Icon size={18} className="text-charcoal-400" strokeWidth={1.8} />
                <h3 className="font-medium text-charcoal-700">{item.name}</h3>
              </div>
              <span className="flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sand-100 text-charcoal-500 border border-sand-300">
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-charcoal-500 leading-relaxed">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

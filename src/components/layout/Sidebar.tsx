'use client'

import { TrendingUp, PackageX, Mail, Users, Info, HeadphonesIcon } from 'lucide-react'

export type SectionId = 'sales-overview' | 'late-shipments' | 'email-performance' | 'customer-intelligence' | 'customer-service' | 'about'

const NAV_ITEMS: { id: SectionId; label: string; Icon: React.ElementType }[] = [
  { id: 'sales-overview',        label: 'Sales Overview',       Icon: TrendingUp },
  { id: 'late-shipments',        label: 'Late Shipments',       Icon: PackageX },
  { id: 'email-performance',     label: 'Email Performance',    Icon: Mail },
  { id: 'customer-intelligence', label: 'Customer Intelligence',Icon: Users },
  { id: 'customer-service',      label: 'Customer Service',     Icon: HeadphonesIcon },
  { id: 'about',                 label: 'About This Tool',      Icon: Info },
]

interface SidebarProps {
  active: SectionId
  onSelect: (id: SectionId) => void
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
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
        <p className="text-xs text-olive-200 font-sans leading-relaxed">
          Connected to Shopify
          <br />
          &amp; Omnisend
        </p>
      </div>
    </aside>
  )
}

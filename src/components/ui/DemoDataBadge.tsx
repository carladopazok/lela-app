import { Info } from 'lucide-react'

export default function DemoDataBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-dashed border-violet-300"
      title="Illustrative dataset — the real Omnisend account has too little send volume yet for these views to be meaningful. Structure and ranges are realistic; the numbers are not live."
    >
      <Info size={12} />
      Demo data
    </span>
  )
}

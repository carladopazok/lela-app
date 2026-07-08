export default function LoadingSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-8 h-8 border-2 border-sand-300 border-t-terracotta-500 rounded-full animate-spin" />
      <p className="text-sm text-charcoal-400 font-sans">{label}</p>
    </div>
  )
}

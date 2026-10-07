export default function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">{children}</h2>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  )
}

export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never'
}

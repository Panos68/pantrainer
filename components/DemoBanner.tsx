import { isDemoMode } from '@/lib/demo-mode'

// Server component: shown on every page of a demo instance.
export default function DemoBanner() {
  if (!isDemoMode()) return null
  return (
    <div className="w-full bg-lime-400 text-zinc-950 text-[11px] font-mono font-bold text-center py-1.5 px-4">
      Demo instance with sample data — changes reset regularly.{' '}
      <a href="https://github.com/Panos68/pantrainer" className="underline underline-offset-2">Self-host your own →</a>
    </div>
  )
}
